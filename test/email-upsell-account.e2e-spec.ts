import { createConnection, Connection, Types } from 'mongoose';
import { EmailUpsellAccountService } from '../src/conversion/email-upsell-account.service';

// Opt-in: supply an isolated loopback mongod, never the application's .env URI.
const uri = process.env.EMAIL_UPSELL_TEST_MONGO_URI;
const integration = uri ? describe : describe.skip;
integration('email upsell ownership with real MongoDB', () => {
  let db: Connection, service: EmailUpsellAccountService;
  const funnelId = new Types.ObjectId();
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri || '')) throw new Error('An isolated loopback MongoDB is required');
    db = await createConnection(uri!, { dbName: 'email_upsell_test_' + new Types.ObjectId().toString(), autoIndex: false }).asPromise();
    service = new EmailUpsellAccountService(db);
    await db.collection('funnels').insertOne({ _id: funnelId, accountId: 'account-a', nodes: [{ id: 'node-1' }] });
    await db.collection('payments').insertMany([
      { orderId: 100, customerId: 42, type: 'SALE', accountId: 'account-a' },
      { orderId: 200, customerId: 42, type: 'SALE', accountId: 'account-b' },
      { orderId: 300, customerId: 42, type: 'SALE', accountId: 'account-a' },
      { orderId: 300, customerId: 42, type: 'UPSELL_SALE', accountId: 'account-b' },
    ]);
  });
  afterAll(async () => { await db?.close(); }); // Ephemeral mongod owner handles cleanup.
  it('uses exact order/customer rather than the other account of the same customer ID', async () => {
    await expect(service.resolve({ order_id: 100, customer_id: 42 }, 42)).resolves.toBe('account-a');
    await expect(service.resolve({ order_id: 100, customer_id: 43 }, 43)).rejects.toMatchObject({ code: 'MISSING_ACCOUNT_CONTEXT' });
  });
  it('checks node membership in the server-owned funnel for external orders', async () => {
    await expect(service.resolve({ order_id: 999, customer_id: 42, tracking16: String(funnelId), tracking17: 'node-1' }, 42)).resolves.toBe('account-a');
    await expect(service.resolve({ order_id: 999, customer_id: 42, tracking16: String(funnelId), tracking17: 'wrong' }, 42)).rejects.toMatchObject({ code: 'INVALID_FUNNEL_CONTEXT' });
  });
  it('rejects ambiguity and conflicts without changing any payment', async () => {
    await expect(service.resolve({ order_id: 300, customer_id: 42 }, 42)).rejects.toMatchObject({ code: 'AMBIGUOUS_ACCOUNT_CONTEXT' });
    await expect(service.resolve({ order_id: 200, customer_id: 42, tracking16: String(funnelId), tracking17: 'node-1' }, 42)).rejects.toMatchObject({ code: 'CONFLICTING_ACCOUNT_CONTEXT' });
    expect(await db.collection('payments').countDocuments()).toBe(4);
  });
});
