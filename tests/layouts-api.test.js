const test = require('node:test');
const assert = require('node:assert/strict');

const rows = new Map();
let nextId = 1;

class Query {
  constructor(operation = 'select', payload = null) { this.operation = operation; this.payload = payload; this.filters = []; }
  select() { return this; }
  insert(payload) { return new Query('insert', payload); }
  update(payload) { return new Query('update', payload); }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  single() { return this.execute(true); }
  then(resolve, reject) { return this.execute(false).then(resolve, reject); }
  async execute(single) {
    if (this.operation === 'insert') {
      const value = { id: `layout-${nextId++}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...this.payload };
      rows.set(value.id, value); return { data: single ? structuredClone(value) : [structuredClone(value)], error: null };
    }
    let values = [...rows.values()].filter(row => this.filters.every(([key, value]) => row[key] === value));
    if (this.operation === 'update') { values.forEach(row => Object.assign(row, this.payload)); }
    const data = values.map(row => structuredClone(row));
    return { data: single ? data[0] : data, error: single && !data[0] ? new Error('not found') : null };
  }
}

global.window = {
  supabase: {
    createClient: () => ({
      from: () => new Query(),
      rpc: async (_name, args) => {
        const row = rows.get(args.layout_id);
        if (!row || row.version !== args.expected_version || row.is_archived) return { data: false, error: null };
        row.is_archived = true; row.version += 1; return { data: true, error: null };
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } })
    })
  }
};

require('../src/api/layouts-api.js');
const config = { url: 'https://abc-project.supabase.co', anonKey: 'public-test-key' };
const project = { version: '3.1.0', room: { boundary: [] }, furniture: [], settings: {} };

test('create, list, update and optimistic conflict', async () => {
  rows.clear(); nextId = 1;
  const apiA = new window.AIADLayoutsAPI(config), apiB = new window.AIADLayoutsAPI(config);
  const created = await apiA.create({ name: '지훈 테스트', author_name: '박지훈', description: '', layout_data: project });
  assert.equal(created.version, 1);
  assert.equal((await apiB.list()).length, 1);
  const updated = await apiA.update(created.id, 1, { name: created.name, author_name: created.author_name, description: '', layout_data: { ...project, furniture: [{ id: 'desk-1' }] } });
  assert.equal(updated.version, 2);
  await assert.rejects(() => apiB.update(created.id, 1, { name: created.name, author_name: '허규진', description: '', layout_data: project }), /LAYOUT_VERSION_CONFLICT/);
});

test('soft archive is version checked', async () => {
  const api = new window.AIADLayoutsAPI(config), item = [...rows.values()][0];
  await assert.rejects(() => api.archive(item.id, 1), /LAYOUT_VERSION_CONFLICT/);
  assert.equal(await api.archive(item.id, 2), true);
  assert.equal((await api.list()).length, 0);
});

test('rejects malformed layout data', () => {
  const api = new window.AIADLayoutsAPI(config);
  assert.throws(() => api.validate({ name: '', author_name: 'A', layout_data: project }), /LAYOUT_NAME_REQUIRED/);
  assert.throws(() => api.validate({ name: 'A', author_name: 'B', layout_data: { room: {}, furniture: {} } }), /INVALID_LAYOUT_DATA/);
});
