import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

export class EmailUpsellAccountError extends Error {
  constructor(public readonly code: string) {
    super('The account for this email upsell could not be verified');
  }
}

const validAccount = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
  !/^(default|undefined|null)$/i.test(value);

/** Read-only resolution from the selected Vrio order, never email/IP or a
 * caller-supplied account. Must complete before an email upsell can be charged.
 */
@Injectable()
export class EmailUpsellAccountService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async resolve(order: Record<string, any>, customerId: unknown): Promise<string> {
    const customer = Number(customerId), orderId = Number(order.order_id);
    if (!Number.isSafeInteger(customer) || customer <= 0 ||
        !Number.isSafeInteger(orderId) || orderId <= 0 || Number(order.customer_id) !== customer) {
      throw new EmailUpsellAccountError('INVALID_ORDER_CUSTOMER_CONTEXT');
    }
    const parents = await this.connection.collection('payments').find(
      { orderId, customerId: customer, type: { $in: ['SALE', 'UPSELL_SALE'] } },
      { projection: { accountId: 1 }, maxTimeMS: 5000 },
    ).limit(11).toArray();
    // Never declare uniqueness from a truncated result set.
    if (parents.length > 10) throw new EmailUpsellAccountError('AMBIGUOUS_ACCOUNT_CONTEXT');
    const accounts = new Set<string>(parents.map(row => row.accountId).filter(validAccount));
    if (accounts.size > 1) throw new EmailUpsellAccountError('AMBIGUOUS_ACCOUNT_CONTEXT');

    // External parent orders may predate the local payments ledger. Their
    // tracking16/17 may still point to one real, server-owned funnel/node.
    const funnelId = order.tracking16, nodeId = order.tracking17;
    if (funnelId || nodeId) {
      if (typeof funnelId !== 'string' || !/^[a-f\d]{24}$/i.test(funnelId) ||
          typeof nodeId !== 'string' || !nodeId.trim() || nodeId.length > 200) {
        throw new EmailUpsellAccountError('INVALID_FUNNEL_CONTEXT');
      }
      const funnel = await this.connection.collection('funnels').findOne(
        { _id: new Types.ObjectId(funnelId), 'nodes.id': nodeId },
        { projection: { accountId: 1 }, maxTimeMS: 5000 },
      );
      if (!validAccount(funnel?.accountId)) throw new EmailUpsellAccountError('INVALID_FUNNEL_CONTEXT');
      accounts.add(funnel.accountId);
    }
    if (accounts.size !== 1) throw new EmailUpsellAccountError(accounts.size ? 'CONFLICTING_ACCOUNT_CONTEXT' : 'MISSING_ACCOUNT_CONTEXT');
    return [...accounts][0];
  }
}
