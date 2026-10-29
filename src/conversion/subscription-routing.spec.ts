import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { VrioService } from '../vrio/vrio.service';
import { ConversionService } from './conversion.service';

describe('SMC checkout bump uses funnel subscription routing', () => {
  function setup(options: { selected?: boolean; mainFails?: boolean; fallback?: boolean; bumpFails?: boolean } = {}) {
    const requests: { url: string; body: any }[] = [];
    const jobs = { createJob: jest.fn().mockResolvedValue({}) };
    let mainAttempts = 0;
    const http = {
      patch: jest.fn().mockReturnValue(of({ status: 200, data: {} })),
      get: jest.fn().mockImplementation((url: string) => of({ status: 200, data: { offer_type_id: url.endsWith('/4') ? 2 : 1 } })),
      post: jest.fn().mockImplementation((url, body) => {
        requests.push({ url, body });
        if (url.endsWith('/process')) {
          mainAttempts++;
          if (options.mainFails || (options.fallback && mainAttempts === 1)) return of({ status: 200, data: { error: 'Insufficient Funds', payment_failed: true } });
          return of({ status: 200, data: { order_id: 123, customer_id: 42, order: { customer_card_id: 7 }, transactions: [{ merchant_id: 99 }] } });
        }
        return of({ status: 200, data: options.bumpFails ? { error: 'SMC declined', payment_failed: true } : { order_id: 456 } });
      }),
    };
    const config = { get: (key: string) => ({ VRIO_API_URL: 'https://vrio.example.test', VRIO_API_KEY: 'mock' })[key] };
    const findOne = jest.fn().mockResolvedValue({ subscription_route_id: 11 });
    const vrio = new VrioService(http as any, config as any, { collection: () => ({ findOne }) } as any);
    const service = new ConversionService({} as any, vrio, jobs as any, {} as any, http as any, config as any, {} as any);
    const dto: any = {
      conversionType: 'PURCHASE', accountId: 'account-a', ftFunnelId: '690c7d06d341cc9b561b56a9', ftNodeId: 'checkout-1',
      customerId: 42, prevOrderId: 123, stickyCampaignId: 32, creditCardNumber: '4111111111111111',
      mainOfferId: '6', mainProductId: '1', bumpOfferId: '4', bumpProductId: '3', isBump: options.selected === false ? '0' : '1',
      offers: [{ type: 'MAIN', offerId: '6', productId: '1', ...(options.fallback && { fallbackOffers: [{ offerId: '8', productId: '12', campaignId: 101, priority: 1 }] }) }, { type: 'BUMP', offerId: '4', productId: '3', isTrial: false }],
    };
    return { service, dto, requests, jobs, findOne };
  }
  beforeEach(() => { for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());
  it('submits book once, then the selected SMC trial once with the saved route and card', async () => {
    const { service, dto, requests } = setup();
    expect((await service.process(dto)).order_id).toBe(123);
    expect(requests).toHaveLength(2);
    expect(requests[0].body.offers.map(x => x.offer_id)).toEqual([6]);
    expect(requests[0].body.route_id).toBeUndefined();
    expect(requests[1].body).toMatchObject({ route_id: 11, customer_card_id: 7, offers: [{ offer_id: 4, item_id: 3, order_offer_upsell: true, parent_order_id: 123, parent_offer_id: 6 }] });
    expect(requests[1].body.merchant_id).toBeUndefined();
  });
  it('does not create an SMC order when unselected', async () => {
    const { service, dto, requests, findOne } = setup({ selected: false });
    await service.process(dto); expect(requests).toHaveLength(1); expect(findOne).not.toHaveBeenCalled();
  });
  it('does not create an SMC order after a failed book purchase', async () => {
    const { service, dto, requests } = setup({ mainFails: true });
    await service.process(dto); expect(requests).toHaveLength(1);
  });
  it('uses the original funnel route after a successful fallback book purchase', async () => {
    const { service, dto, requests } = setup({ fallback: true });
    await service.process(dto); expect(requests).toHaveLength(3);
    expect(requests[2].body).toMatchObject({ route_id: 11, offers: [{ parent_offer_id: 8, parent_order_id: 123 }] });
  });
  it('retains the existing successful-book response when the SMC upsell declines', async () => {
    const { service, dto, requests } = setup({ bumpFails: true });
    expect((await service.process(dto)).order_id).toBe(123); expect(requests).toHaveLength(2);
  });
});
