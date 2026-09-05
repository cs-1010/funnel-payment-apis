import { EmailUpsellAccountService, EmailUpsellAccountError } from './email-upsell-account.service';

const funnelId = '507f1f77bcf86cd799439011';
const order = { order_id: 123, customer_id: 42 };
describe('EmailUpsellAccountService', () => {
  function setup(parents: any[] = [], funnel: any = null) {
    const cursor = { limit: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue(parents) };
    const payments = { find: jest.fn().mockReturnValue(cursor) };
    const funnels = { findOne: jest.fn().mockResolvedValue(funnel) };
    const connection = { collection: jest.fn(name => name === 'payments' ? payments : funnels) };
    return { service: new EmailUpsellAccountService(connection as any), payments, funnels, cursor };
  }
  it('resolves an exact parent order AND customer, never customer/email alone', async () => {
    const { service, payments, funnels } = setup([{ accountId: 'account-a' }]);
    await expect(service.resolve(order, 42)).resolves.toBe('account-a');
    expect(payments.find).toHaveBeenCalledWith({ orderId: 123, customerId: 42, type: { $in: ['SALE', 'UPSELL_SALE'] } }, { projection: { accountId: 1 }, maxTimeMS: 5000 });
    expect(funnels.findOne).not.toHaveBeenCalled();
  });
  it('resolves an external parent through its server-owned funnel and node', async () => {
    const { service, funnels } = setup([], { accountId: 'account-a' });
    await expect(service.resolve({ ...order, tracking16: funnelId, tracking17: 'node-1' }, 42)).resolves.toBe('account-a');
    expect(funnels.findOne).toHaveBeenCalledWith({ _id: expect.anything(), 'nodes.id': 'node-1' }, { projection: { accountId: 1 }, maxTimeMS: 5000 });
    expect(funnels.findOne.mock.calls[0][0]._id.toString()).toBe(funnelId);
  });
  it('requires parent and funnel ownership to agree when both exist', async () => {
    const { service } = setup([{ accountId: 'account-a' }], { accountId: 'account-b' });
    await expect(service.resolve({ ...order, tracking16: funnelId, tracking17: 'node-1' }, 42)).rejects.toMatchObject({ code: 'CONFLICTING_ACCOUNT_CONTEXT' });
  });
  it('rejects the same order/customer appearing under different accounts', async () => {
    const { service } = setup([{ accountId: 'a' }, { accountId: 'b' }]);
    await expect(service.resolve(order, 42)).rejects.toMatchObject({ code: 'AMBIGUOUS_ACCOUNT_CONTEXT' });
  });
  it('rejects truncated parent matches instead of assuming uniqueness', async () => {
    const { service, cursor } = setup(Array.from({ length: 11 }, () => ({ accountId: 'a' })));
    await expect(service.resolve(order, 42)).rejects.toBeInstanceOf(EmailUpsellAccountError);
    expect(cursor.limit).toHaveBeenCalledWith(11);
  });
  it.each(['', 'default', 'undefined', 'null', null])('does not use placeholder account %s', async accountId => {
    const { service } = setup([{ accountId }]);
    await expect(service.resolve(order, 42)).rejects.toMatchObject({ code: 'MISSING_ACCOUNT_CONTEXT' });
  });
  it.each([
    { tracking16: 'invalid', tracking17: 'node' },
    { tracking16: funnelId },
    { tracking17: 'node' },
    { tracking16: { $ne: null }, tracking17: 'node' },
    { tracking16: funnelId, tracking17: { $ne: null } },
  ])('rejects incomplete or malformed funnel references %j', async tracking => {
    const { service, funnels } = setup([], { accountId: 'a' });
    await expect(service.resolve({ ...order, ...tracking }, 42)).rejects.toMatchObject({ code: 'INVALID_FUNNEL_CONTEXT' });
    expect(funnels.findOne).not.toHaveBeenCalled();
  });
  it('rejects a missing funnel or node instead of trusting raw tracking', async () => {
    const { service } = setup([], null);
    await expect(service.resolve({ ...order, tracking16: funnelId, tracking17: 'unknown' }, 42)).rejects.toMatchObject({ code: 'INVALID_FUNNEL_CONTEXT' });
  });
  it('rejects a different customer before any database lookup', async () => {
    const { service, payments } = setup([{ accountId: 'a' }]);
    await expect(service.resolve(order, 99)).rejects.toMatchObject({ code: 'INVALID_ORDER_CUSTOMER_CONTEXT' });
    expect(payments.find).not.toHaveBeenCalled();
  });
  it('propagates database failures, never supplying a default account', async () => {
    const { service, cursor } = setup();
    cursor.toArray.mockRejectedValue(new Error('database unavailable'));
    await expect(service.resolve(order, 42)).rejects.toThrow('database unavailable');
  });
});
