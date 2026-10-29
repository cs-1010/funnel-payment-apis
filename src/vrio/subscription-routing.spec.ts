import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { VrioService, SubscriptionRoutingContext } from './vrio.service';

const funnelId = '690c7d06d341cc9b561b56a9';
const context: SubscriptionRoutingContext = { funnelId, accountId: 'account-a', nodeId: 'checkout-1' };
describe('funnel subscription routing before provider processing', () => {
  function setup(route: unknown = 17) {
    const findOne = jest.fn().mockResolvedValue({ subscription_route_id: route });
    const http = {
      get: jest.fn().mockImplementation((url: string) => of({ status: 200, data: { offer_type_id: url.endsWith('/6') ? 1 : 2 } })),
      post: jest.fn().mockReturnValue(of({ status: 200, data: { order_id: 123 } })),
    };
    const config = { get: (key: string) => ({ VRIO_API_URL: 'https://vrio.example.test', VRIO_API_KEY: 'mock' })[key] };
    const service = new VrioService(http as any, config as any, { collection: () => ({ findOne }) } as any);
    const payload = { connection_id: 1, campaign_id: 129, customer_id: 42, merchant_id: 91, route_id: 5, offers: [{ offer_id: 4 }] };
    return { service, http, findOne, payload };
  }
  beforeEach(() => { for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());

  it.each([129, 32, 101])('uses the saved route even for campaign %s and removes merchant bypass', async campaign => {
    const { service, http, findOne, payload } = setup();
    await service.processUpsell({ ...payload, campaign_id: campaign }, { routingContext: context });
    expect(http.post).toHaveBeenCalledWith('https://vrio.example.test/orders', expect.objectContaining({ route_id: 17 }), expect.anything());
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('merchant_id');
    expect(findOne.mock.calls[0][0]).toMatchObject({ accountId: 'account-a', 'nodes.id': 'checkout-1', isArchived: { $ne: true } });
    expect(String(findOne.mock.calls[0][0]._id)).toBe(funnelId);
    expect(payload).toMatchObject({ merchant_id: 91, route_id: 5 });
  });
  it('applies the saved route to a recurring main checkout too', async () => {
    const { service, http, payload } = setup(2);
    await service.processCheckout('123', payload, context);
    expect(http.post.mock.calls[0][1].route_id).toBe(2);
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('merchant_id');
  });
  it('checks every offer, including a recurring offer after a one-time offer', async () => {
    const { service, http, payload } = setup(8);
    await service.processUpsell({ ...payload, offers: [{ offer_id: 6 }, { offer_id: 4 }] }, { routingContext: context });
    expect(http.post.mock.calls[0][1].route_id).toBe(8);
    expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('leaves one-time merchant selection intact and requires no funnel lookup', async () => {
    const { service, http, findOne, payload } = setup();
    await service.processCheckout('123', { ...payload, offers: [{ offer_id: 6 }] });
    expect(http.post.mock.calls[0][1]).toMatchObject({ merchant_id: 91 });
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('route_id');
    expect(findOne).not.toHaveBeenCalled();
  });
  it.each([null, undefined, 0, -1, 1.5, '5'])('does not submit a recurring order with invalid/missing saved route %s', async value => {
    const { service, http, payload, findOne } = setup();
    findOne.mockResolvedValue(value == null ? null : { subscription_route_id: value });
    await expect(service.processUpsell(payload, { routingContext: context })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
  it.each([{}, { funnelId: 'invalid', accountId: 'account-a' }, { ...context, attributionFunnelId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }])('rejects unverifiable funnel context before charging', async routingContext => {
    const { service, http, payload } = setup();
    await expect(service.processUpsell(payload, { routingContext })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('does not submit when the provider offer lookup fails', async () => {
    const { service, http, payload } = setup();
    http.get.mockReturnValue(throwError(() => new Error('unavailable')));
    await expect(service.processUpsell(payload, { routingContext: context })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('does not submit when the funnel database is unavailable', async () => {
    const { service, http, payload, findOne } = setup();
    findOne.mockRejectedValue(new Error('database unavailable'));
    await expect(service.processUpsell(payload, { routingContext: context })).rejects.toThrow();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('reuses offer classification briefly but reads the latest funnel route on each order', async () => {
    const { service, http, payload, findOne } = setup(5);
    await service.processUpsell(payload, { routingContext: context });
    findOne.mockResolvedValue({ subscription_route_id: 2 });
    await service.processUpsell(payload, { routingContext: context });
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls.map(call => call[1].route_id)).toEqual([5, 2]);
  });
});
