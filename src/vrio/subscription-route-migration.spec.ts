import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('subscription route migration safeguards', () => {
  const source = readFileSync(resolve(__dirname, '../../scripts/backfill-subscription-routes.cjs'), 'utf8');
  function setup() {
    const rows: any[] = [
      { _id: 'a', stickyCampaignId: 129, updatedAt: new Date('2026-10-01') },
      { _id: 'b', stickyCampaignId: 32, updatedAt: new Date('2026-10-01') },
      { _id: 'c', stickyCampaignId: 101, subscription_route_id: null, updatedAt: new Date('2026-10-01') },
      { _id: 'd', stickyCampaignId: 129, subscription_route_id: 11, updatedAt: new Date('2026-10-01') },
    ];
    const files = new Map<string, string>();
    const updates: any[] = [];
    let active = true;
    function match(row: any, filter: any) {
      return Object.entries(filter).every(([key, value]: any) => {
        if (key === '_id') return String(row[key]) === String(value);
        if (value && typeof value === 'object' && '$exists' in value) return Object.hasOwn(row, key) === value.$exists;
        if (value?.getTime) return row[key]?.getTime() === value.getTime();
        return value === null ? row[key] == null : row[key] === value;
      });
    }
    const collection = {
      find: (filter: any) => ({ toArray: async () => rows.filter(row => match(row, filter)).map(row => ({ ...row })) }),
      async updateOne(filter: any, update: any) {
        updates.push({ filter, update });
        const row = rows.find(row => match(row, filter));
        if (!row) return { modifiedCount: 0 };
        if (update.$set) Object.assign(row, update.$set);
        if (update.$unset) for (const key of Object.keys(update.$unset)) delete row[key];
        return { modifiedCount: 1 };
      },
      countDocuments: async (filter: any) => rows.filter(row => match(row, filter)).length,
    };
    const MongoClient = class { async connect() {} db() { return { collection: () => collection }; } async close() {} };
    const ObjectId = class { constructor(private id: string) {} toString() { return this.id; } };
    const fs = { readFileSync: (name: string) => files.get(name), writeFileSync: (name: string, data: string, opts: any) => { if (files.has(name) && opts.flag === 'wx') throw new Error('Snapshot already exists'); files.set(name, data); } };
    async function run(args: string[] = []) {
      const process = { argv: ['node', 'migration', ...args], env: { MONGODB_URI: 'mock', VRIO_API_URL: 'https://api.vrio.app', VRIO_API_KEY: 'mock' }, exitCode: 0 };
      const logs: string[] = [], errors: string[] = [];
      await runInNewContext(source, { require: (name: string) => name === 'mongodb' ? { MongoClient, ObjectId } : name === 'node:fs' ? fs : require(name), process, URL, AbortSignal, console: { log: (x: string) => logs.push(x), error: (x: string) => errors.push(x) }, fetch: async () => ({ ok: true, json: async () => ({ routes: [2, 5].map(id => ({ route_id: id, route_active: active })) }) }) });
      return { process, logs, errors };
    }
    return { rows, files, updates, run, inactive: () => { active = false; } };
  }
  it('defaults to a read-only dry run and leaves existing routes intact', async () => {
    const { run, rows, updates, files } = setup();
    const result = await run();
    expect(result.process.exitCode).toBe(0); expect(updates).toHaveLength(0); expect(files.size).toBe(0);
    expect(JSON.parse(result.logs[0])).toMatchObject({ mode: 'dry-run', count: 3, counts: { 2: 2, 5: 1 } });
    expect(rows[3].subscription_route_id).toBe(11);
  });
  it('seeds missing routes, saves a snapshot, and preserves explicit choices', async () => {
    const { run, rows, files } = setup();
    expect((await run(['--apply', '--snapshot', '/snapshot'])).process.exitCode).toBe(0);
    expect(rows.map(row => row.subscription_route_id)).toEqual([5, 2, 2, 11]);
    expect(JSON.parse(files.get('/snapshot')!).rows).toHaveLength(3);
  });
  it('can be repeated without overwriting choices or the previous snapshot', async () => {
    const { run, files, updates } = setup();
    await run(['--apply', '--snapshot', '/snapshot']);
    const saved = files.get('/snapshot');
    expect((await run(['--apply', '--snapshot', '/snapshot'])).process.exitCode).toBe(0);
    expect(updates).toHaveLength(3); expect(files.get('/snapshot')).toBe(saved);
  });
  it('does not write when a required default route is inactive', async () => {
    const { run, updates, files, inactive } = setup(); inactive();
    expect((await run(['--apply', '--snapshot', '/snapshot'])).process.exitCode).toBe(1);
    expect(updates).toHaveLength(0); expect(files.size).toBe(0);
  });
  it('restores missing versus null values and preserves a funnel edited after migration', async () => {
    const { run, rows } = setup();
    await run(['--apply', '--snapshot', '/snapshot']);
    rows[1].updatedAt = new Date('2026-10-29');
    expect((await run(['--rollback', '/snapshot'])).process.exitCode).toBe(0);
    expect(Object.hasOwn(rows[0], 'subscription_route_id')).toBe(false);
    expect(rows[1].subscription_route_id).toBe(2);
    expect(rows[2].subscription_route_id).toBeNull();
    expect(rows[3].subscription_route_id).toBe(11);
  });
  it('handles legacy funnels with null or absent modification timestamps', async () => {
    const { run, rows } = setup();
    rows[0].updatedAt = null;
    delete rows[1].updatedAt;
    expect((await run(['--apply', '--snapshot', '/snapshot'])).process.exitCode).toBe(0);
    expect(rows.map(row => row.subscription_route_id)).toEqual([5, 2, 2, 11]);
    expect((await run(['--rollback', '/snapshot'])).process.exitCode).toBe(0);
    expect(Object.hasOwn(rows[0], 'subscription_route_id')).toBe(false);
    expect(Object.hasOwn(rows[1], 'subscription_route_id')).toBe(false);
  });
});
