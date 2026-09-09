import { Logger, ValidationPipe } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ConversionService } from './conversion.service';
import { ConversionDto, ConversionType } from './dto/conversion.dto';
import { VrioService } from '../vrio/vrio.service';

describe('optional checkout phone', () => {
  const number = '+1 (415) 555-0123';
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const base = {
    conversionType: ConversionType.PURCHASE, accountId: 'account-test',
    email: 'buyer@example.test', firstName: 'Pat', lastName: 'Buyer',
    customerId: 42, prevOrderId: 123, stickyCampaignId: 129,
    creditCardNumber: '4111111111111111', creditCardExpiryMonth: '12',
    creditCardExpiryYear: '2030', cvc: '123',
    mainOfferId: '6', mainProductId: '4',
    offers: [{ type: 'MAIN', offerId: '6', productId: '4' }],
  };
  const dto = (fields: Record<string, unknown> = {}): Promise<ConversionDto> =>
    pipe.transform({ ...base, ...fields }, { type: 'body', metatype: ConversionDto });

  function setup() {
    const http = {
      patch: jest.fn().mockReturnValue(of({ status: 200, data: { customer_id: 42 } })),
      post: jest.fn().mockReturnValue(of({ status: 200, data: { order_id: 123, customer_id: 42 } })),
    };
    const config = { get: jest.fn((key: string) => ({
      VRIO_API_URL: 'https://vrio.example.test', VRIO_API_KEY: 'test-key',
    })[key]) };
    const vrio = new VrioService(http as any, config as any);
    const jobs = { createJob: jest.fn().mockResolvedValue({}) };
    const service = new ConversionService({} as any, vrio, jobs as any, {} as any, http as any, config as any, {} as any);
    return { service, vrio, http, jobs };
  }

  beforeEach(() => {
    for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps a formatted number through DTO validation, customer PATCH and the sale job', async () => {
    const { service, http, jobs } = setup();
    const result = await service.process(await dto({ phone: '  ' + number + '  ' }));
    expect(result.order_id).toBe(123);
    expect(http.patch).toHaveBeenCalledWith('https://vrio.example.test/customers/42', {
      first_name: 'Pat', last_name: 'Buyer', phone: number,
    }, expect.any(Object));
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(jobs.createJob).toHaveBeenCalledWith('SALE', expect.objectContaining({ postedPayload: expect.objectContaining({ phone: number }) }));
  });

  it.each([undefined, null, '', '   '])('allows checkout without a phone (%s) and does not clear the saved customer phone', async phone => {
    const { service, http } = setup();
    expect((await service.process(await dto({ phone }))).order_id).toBe(123);
    expect(http.patch.mock.calls[0][1]).not.toHaveProperty('phone');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('updates a supplied phone even when names are absent', async () => {
    const { service, http } = setup();
    await service.process(await dto({ phone: number, firstName: undefined, lastName: undefined }));
    expect(http.patch).toHaveBeenCalledWith('https://vrio.example.test/customers/42', { phone: number }, expect.any(Object));
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it.each([number, undefined, '   '])('handles new-prospect checkout with optional phone (%s)', async phone => {
    const { service, http } = setup();
    expect((await service.process(await dto({ phone, customerId: undefined, prevOrderId: undefined }))).order_id).toBe(123);
    const createOrder = http.post.mock.calls.find(([url]) => url === 'https://vrio.example.test/orders');
    expect(createOrder).toBeDefined();
    if (phone?.trim()) expect(createOrder![1].phone).toBe(number);
    else expect(createOrder![1]).not.toHaveProperty('phone');
    expect(http.post.mock.calls.filter(([url]) => url.endsWith('/process'))).toHaveLength(1);
  });

  it('preserves the existing non-blocking customer-update failure behavior', async () => {
    const { service, http } = setup();
    http.patch.mockReturnValue(throwError(() => new Error('customer update unavailable')));
    expect((await service.process(await dto({ phone: number }))).order_id).toBe(123);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it.each([12345, '1'.repeat(21)])('rejects invalid phone types and overlong values before any provider request (%s)', async phone => {
    const { service, http } = setup();
    await expect(dto({ phone }).then(value => service.process(value))).rejects.toThrow();
    expect(http.patch).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});
