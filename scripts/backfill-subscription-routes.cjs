// Run in the payment service environment. Defaults to a read-only dry run.
// --apply seeds only unset/null funnel fields; it never updates Vrio orders.
// --rollback <snapshot-file> reverses only fields still equal to this migration's value.
const { MongoClient } = require('mongodb');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rollbackIndex = args.indexOf('--rollback');
const snapshotIndex = args.indexOf('--snapshot');
const snapshotPath = snapshotIndex >= 0 ? args[snapshotIndex + 1] : path.resolve('subscription-route-backfill.json');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (apply && rollbackIndex >= 0) throw new Error('Choose apply or rollback');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 1 });
  try {
    await client.connect(); const funnels = client.db().collection('funnels');
    if (rollbackIndex >= 0) {
      const snapshot = JSON.parse(fs.readFileSync(args[rollbackIndex + 1], 'utf8'));
      if (snapshot.version !== 1 || !Array.isArray(snapshot.rows)) throw new Error('Invalid migration snapshot');
      let restored = 0;
      const { ObjectId } = require('mongodb');
      for (const row of snapshot.rows) {
        const updatedAt = row.hadUpdatedAt ? (row.updatedAt == null ? null : new Date(row.updatedAt)) : { $exists: false };
        const result = await funnels.updateOne({ _id: new ObjectId(row.id), subscription_route_id: row.routeId, updatedAt }, row.hadField ? { $set: { subscription_route_id: null } } : { $unset: { subscription_route_id: '' } });
        restored += result.modifiedCount;
      }
      console.log(JSON.stringify({ mode: 'rollback', restored })); return;
    }
    const rows = await funnels.find({ subscription_route_id: null }, { projection: { stickyCampaignId: 1, subscription_route_id: 1, updatedAt: 1 }, maxTimeMS: 10000 }).toArray();
    const plan = rows.map(row => ({ id: String(row._id), campaignId: row.stickyCampaignId, updatedAt: row.updatedAt, hadUpdatedAt: Object.hasOwn(row, 'updatedAt'), hadField: Object.hasOwn(row, 'subscription_route_id'), routeId: [32, 101].includes(Number(row.stickyCampaignId)) ? 2 : 5 }));
    const counts = {}; for (const row of plan) counts[row.routeId] = (counts[row.routeId] || 0) + 1;
    if (!apply) { console.log(JSON.stringify({ mode: 'dry-run', count: plan.length, counts })); return; }
    if (!plan.length) { console.log(JSON.stringify({ mode: 'apply', planned: 0, modified: 0, remainingUnconfigured: 0 })); return; }
    const base = new URL(process.env.VRIO_API_URL);
    if (base.protocol !== 'https:' || base.hostname !== 'api.vrio.app' || !process.env.VRIO_API_KEY) throw new Error('Vrio configuration is required');
    const response = await fetch(new URL('/routes?route_id=2,5&route_active=true&limit=200', base), { headers: { 'X-Api-Key': process.env.VRIO_API_KEY }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not validate migration routes');
    const body = await response.json();
    if (!Array.isArray(body.routes)) throw new Error('Invalid route catalog');
    const active = new Set(body.routes.filter(row => row.route_active === true || row.route_active === 1).map(row => Number(row.route_id)));
    if (plan.some(row => !active.has(row.routeId))) throw new Error('A required migration route is inactive');
    fs.writeFileSync(snapshotPath, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), rows: plan }, null, 2), { flag: 'wx', mode: 0o600 });
    let modified = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], item = plan[i];
      const result = await funnels.updateOne({ _id: row._id, stickyCampaignId: row.stickyCampaignId, subscription_route_id: null, updatedAt: item.hadUpdatedAt ? row.updatedAt : { $exists: false } }, { $set: { subscription_route_id: item.routeId } });
      modified += result.modifiedCount;
    }
    const remainingUnconfigured = await funnels.countDocuments({ subscription_route_id: null });
    console.log(JSON.stringify({ mode: 'apply', planned: plan.length, modified, counts, snapshot: snapshotPath, remainingUnconfigured }));
    if (remainingUnconfigured) throw new Error('Some funnels remain unconfigured. Re-run with a new snapshot before deploying payment routing.');
  } finally { await client.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
