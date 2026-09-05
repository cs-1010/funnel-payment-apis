import { Logger } from '@nestjs/common';
import { ConversionService } from './conversion.service';
import { EmailUpsellAccountError } from './email-upsell-account.service';

describe('email upsell account handoff', () => {
  const lastOrder = { order_id: 123, customer_id: 42, customer_card_id: 7, tracking16: '507f1f77bcf86cd799439011', tracking17: 'node-1' };
  function setup() {
    const vrio = { getCustomerAndLastOrderByEmail: jest.fn().mockResolvedValue({ customer: { customer_id: 42 }, lastOrder }), getOrdersByCustomerId: jest.fn().mockResolvedValue([]) };
    const jobs = { createJob: jest.fn().mockResolvedValue({}) };
    const accounts = { resolve: jest.fn().mockResolvedValue('account-a') };
    const service = new ConversionService({} as any, vrio as any, jobs as any, {} as any, {} as any, { get: jest.fn() } as any, accounts as any);
    const charge = jest.spyOn(service, 'processUpsell').mockResolvedValue({ order_id: 456 });
    return { service, vrio, jobs, accounts, charge };
  }
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  it('preserves the upsell payload and calls the charge path once with its resolved account', async () => {
    const { service, accounts, charge } = setup();
    await expect(service.processUpsellByEmail('buyer@example.test', 'offer-1', 'product-1')).resolves.toEqual({ order_id: 456 });
    expect(accounts.resolve).toHaveBeenCalledWith(lastOrder, 42);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-a', customerId: 42, prevOrderId: 123, customerCardId: 7, mainOfferId: 'offer-1', mainProductId: 'product-1', stickyCampaignId: 7, lastAttribution: { funnelId: lastOrder.tracking16, nodeId: 'node-1' } }));
  });
  it('resolves the selected successful order, not an older failed order', async () => {
    const { service, vrio, accounts } = setup();
    const selected = { ...lastOrder, order_id: 124, transactions: [{ response_code: 100 }], date_created: '2026-09-05' };
    vrio.getOrdersByCustomerId.mockResolvedValue([selected] as never);
    await service.processUpsellByEmail('buyer@example.test', 'offer-1', 'product-1');
    expect(accounts.resolve).toHaveBeenCalledWith(selected, 42);
  });
  it.each([new EmailUpsellAccountError('MISSING_ACCOUNT_CONTEXT'), new EmailUpsellAccountError('CONFLICTING_ACCOUNT_CONTEXT'), new Error('database unavailable')])('does not charge when resolution fails: %s', async error => {
    const { service, accounts, charge, jobs } = setup();
    accounts.resolve.mockRejectedValue(error);
    await expect(service.processUpsellByEmail('buyer@example.test', 'offer-1', 'product-1')).resolves.toMatchObject({ error_found: '1' });
    expect(charge).not.toHaveBeenCalled();
    expect(jobs.createJob).toHaveBeenCalledWith('ERROR', expect.objectContaining({ errorMessage: expect.stringContaining('no charge was submitted') }));
  });
  it('waits for account resolution before calling the payment path', async () => {
    const { service, accounts, charge } = setup();
    let release!: (id: string) => void;
    accounts.resolve.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = service.processUpsellByEmail('buyer@example.test', 'offer-1', 'product-1');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(charge).not.toHaveBeenCalled(); release('account-a'); await pending;
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
