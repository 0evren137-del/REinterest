import test from 'node:test';
import assert from 'node:assert/strict';
import { performance, total, periodGain, validateData, demoData, emptyData, deleteAsset, buildPartialSnapshot, assetAllocation, overviewSnapshot, searchAssets, collapseSmallAllocation, allocationHierarchy } from '../web/domain.js';
import { LocalRepository } from '../web/repository.js';

const asset = { id: 'a', name: '基金', account: '账户', category: '基金', region: 'domestic', kind: 'investment', currency: 'CNY' };
const snap = (date, value, flows = [], income = 0) => ({ id: date, date, rates: { CNY: 1 }, positions: [{ asset: { ...asset }, value, flows, income }] });
const begin = snap('2026-01-01', 10000);
const dataset = snapshots => ({ version: 1, assets: [{ ...asset }], snapshots: structuredClone(snapshots) });

test('without flows, balance growth is profit and return is relative to opening capital', () => {
  const result = performance(begin, snap('2026-01-21', 10500), 'a');
  assert.equal(result.gain, 500); assert.equal(result.rate, .05);
});
test('new deposits are not investment gain, and dated capital is time weighted', () => {
  const result = performance(begin, snap('2026-01-21', 12500, [{ date: '2026-01-11', amount: 2000 }]), 'a');
  assert.equal(result.gain, 500); assert.equal(result.capital, 11000);
  assert.equal(result.rate, 500 / 11000);
});
test('withdrawals and liquidation do not appear as investment losses', () => {
  const result = performance(begin, snap('2026-01-21', 0, [{ date: '2026-01-21', amount: -10500 }]), 'a');
  assert.equal(result.gain, 500); assert.equal(result.rate, .05);
});
test('cash distributions count as profit exactly once', () => {
  const result = performance(begin, snap('2026-01-21', 10000, [], 300), 'a');
  assert.equal(result.gain, 300); assert.equal(result.rate, .03);
});
test('first snapshot and nonpositive invested capital have no percentage', () => {
  assert.equal(performance(null, begin, 'a'), null);
  assert.equal(performance(snap('2026-01-01', 0), snap('2026-01-21', 1000, [{ date: '2026-01-21', amount: 1000 }]), 'a').rate, null);
});
test('new asset acquisition is a flow, not profit', () => {
  const previous = { ...begin, positions: [] };
  const result = performance(previous, snap('2026-01-21', 2100, [{ date: '2026-01-11', amount: 2000 }]), 'a');
  assert.equal(result.gain, 100); assert.equal(result.capital, 1000); assert.equal(result.rate, .1);
});
test('FX movement changes total balance but does not change native investment gain', () => {
  const previous = snap('2026-01-01', 1000), current = snap('2026-01-21', 1000);
  for (const s of [previous, current]) s.positions[0].asset.currency = 'USD';
  previous.rates.USD = 7; current.rates.USD = 7.2;
  assert.equal(total(current) - total(previous), 200);
  assert.equal(periodGain(previous, current), 0);
});
test('internal transfer between two assets generates no gain', () => {
  const other = { ...asset, id: 'b', kind: 'savings' };
  const p = snap('2026-01-01', 10000), c = snap('2026-01-21', 8000, [{ date: '2026-01-11', amount: -2000 }]);
  p.positions.push({ asset: other, value: 0, flows: [], income: 0 });
  c.positions.push({ asset: other, value: 2000, flows: [{ date: '2026-01-11', amount: 2000 }], income: 0 });
  assert.equal(periodGain(p, c), 0); assert.equal(total(p), total(c));
});
test('backup validation catches invalid rates, duplicates, impossible dates and out-of-period flows', () => {
  const cases = [
    () => { const d = dataset([begin]); d.snapshots[0].rates.CNY = 0; return d; },
    () => dataset([begin, { ...begin, id: 'duplicate' }]),
    () => dataset([snap('2026-02-30', 100)]),
    () => dataset([begin, snap('2026-01-21', 12000, [{ date: '2026-01-01', amount: 2000 }])]),
    () => dataset([snap('2026-01-01', -10)]),
    () => dataset([snap('2026-01-01', 100, [{ date: '2026-01-01', amount: 100 }])])
  ];
  for (const make of cases) assert.throws(() => validateData(structuredClone(make())));
});
test('validation rejects currency changes and disappearing historical assets', () => {
  const d = dataset([structuredClone(begin), snap('2026-01-21', 10)]);
  d.snapshots[1].positions[0].asset.currency = 'USD'; d.snapshots[1].rates.USD = 7;
  assert.throws(() => validateData(d), /更换币种/);
  d.snapshots[1].positions = [];
  assert.throws(() => validateData(d), /历史资产必须保留/);
});
test('empty data and demo data can round trip through backup validation', () => {
  assert.deepEqual(validateData(emptyData()), emptyData());
  const demo = demoData(); assert.deepEqual(validateData(JSON.parse(JSON.stringify(demo))), demo);
});
test('newly recorded asset must include funding rather than count its whole value as gain', () => {
  const previous = { ...structuredClone(begin), positions: [] };
  assert.throws(() => validateData(dataset([previous, snap('2026-01-21', 2000)])), /请填写期间投入/);
  assert.doesNotThrow(() => validateData(dataset([previous, snap('2026-01-21', 2100, [{ date: '2026-01-11', amount: 2000 }])])));
});
test('repository persists, imports/exports and rejects concurrent edits without overwriting', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = new LocalRepository(), second = new LocalRepository();
  await first.load(); await second.load();
  const d = dataset([snap('2026-01-01', 10000)]);
  await first.save(d);
  assert.deepEqual(await new LocalRepository().load(), d);
  const exported = await first.export(d);
  assert.deepEqual((await first.import(exported)).snapshots, d.snapshots);
  await assert.rejects(() => second.save(emptyData()), /另一个标签页/);
  assert.deepEqual(await first.load(), d);
  await assert.rejects(() => first.import('{broken'), SyntaxError);
});

test('deleting a recorded asset removes all its history and recalculates totals without changing other assets', () => {
  const original = demoData(), before = structuredClone(original);
  const result = validateData(deleteAsset(original, 'demo-fund'));
  assert.deepEqual(original, before);
  assert.equal(result.assets.length, original.assets.length - 1);
  assert.equal(result.snapshots.length, original.snapshots.length);
  for (let i = 0; i < result.snapshots.length; i++) {
    const removed = original.snapshots[i].positions.find(p => p.asset.id === 'demo-fund');
    assert.equal(result.snapshots[i].id, original.snapshots[i].id);
    assert.equal(result.snapshots[i].date, original.snapshots[i].date);
    assert.deepEqual(result.snapshots[i].positions, original.snapshots[i].positions.filter(p => p.asset.id !== 'demo-fund'));
    assert.equal(total(result.snapshots[i]), total(original.snapshots[i]) - removed.value);
  }
  const oldGain = periodGain(original.snapshots[0], original.snapshots[1]);
  assert.ok(Math.abs(periodGain(result.snapshots[0], result.snapshots[1]) - (oldGain - 1200)) < 1e-8);
});

test('deleting the last recorded asset leaves valid empty snapshots that survive backup restore', () => {
  const original = dataset([begin, snap('2026-01-21', 12500, [{ date: '2026-01-11', amount: 2000 }], 10)]);
  const result = deleteAsset(original, 'a');
  assert.deepEqual(result.assets, []);
  assert.ok(result.snapshots.every(s => s.positions.length === 0 && total(s) === 0));
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(result))), result);
});

test('first partial record skips unfilled assets and does not require unrelated foreign FX', () => {
  const pending = { ...asset, id: 'pending', currency: 'USD' };
  const original = { version: 1, assets: [asset, pending], snapshots: [] };
  const result = buildPartialSnapshot(original, { date: '2026-01-01', updates: [{ id: 'a', value: 1000 }] });
  assert.equal(result.positions.length, 1);
  assert.equal(result.positions[0].value, 1000);
  assert.equal(result.rates.USD, undefined);
  assert.equal(original.snapshots.length, 0);
});

test('partial update carries untouched valuations and clears old period cash flows', () => {
  const original = demoData();
  const current = original.snapshots[1];
  const result = buildPartialSnapshot(original, { date: current.date, updates: [{ id: 'demo-gold', value: 19000 }] });
  const untouched = result.positions.find(p => p.asset.id === 'demo-fund');
  assert.deepEqual(untouched, current.positions.find(p => p.asset.id === 'demo-fund'));
  assert.equal(result.positions.find(p => p.asset.id === 'demo-gold').value, 19000);
  assert.equal(result.id, current.id);
  assert.equal(current.positions.find(p => p.asset.id === 'demo-gold').value, 18960);
  const old = dataset([begin, snap('2026-01-11', 12000, [{ date: '2026-01-06', amount: 2000 }])]);
  const carried = buildPartialSnapshot(old, { date: '2026-01-21' });
  assert.deepEqual(carried.positions[0].flows, []);
  assert.equal(carried.positions[0].valuedAt, '2026-01-11');
  assert.equal(performance(old.snapshots[1], carried, 'a'), null);
});

test('multiple partial saves on the same day keep previously saved assets and skipped assets absent', () => {
  const b = { ...asset, id: 'b' }, c = { ...asset, id: 'c' };
  const original = { version: 1, assets: [asset, b, c], snapshots: [] };
  const first = buildPartialSnapshot(original, { date: '2026-01-01', updates: [{ id: 'a', value: 1000 }] });
  const next = buildPartialSnapshot({ ...original, snapshots: [first] }, { date: first.date, updates: [{ id: 'b', value: 2000 }] });
  assert.equal(next.id, first.id);
  assert.equal(next.positions.length, 2);
  assert.deepEqual(next.positions[0], first.positions[0]);
  assert.equal(total(next), 3000);
});

test('asset updated after other asset-only snapshots uses its actual previous valuation date', () => {
  const b = { ...asset, id: 'b' };
  const base = dataset([begin]); base.assets.push(b);
  const middle = buildPartialSnapshot(base, { date: '2026-01-11', updates: [{ id: 'b', value: 2000 }] });
  const end = buildPartialSnapshot({ ...base, snapshots: [begin, middle] }, {
    date: '2026-01-21', updates: [{ id: 'a', value: 12500, flows: [{ date: '2026-01-06', amount: 2000 }] }]
  });
  const result = performance(middle, end, 'a');
  assert.equal(result.gain, 500);
  assert.equal(result.capital, 11500);
  assert.equal(result.rate, 500 / 11500);
  assert.equal(performance(middle, end, 'b'), null);
});

test('later asset can establish a baseline without treating its whole value as a gain', () => {
  const b = { ...asset, id: 'b' }, original = dataset([begin]); original.assets.push(b);
  const result = buildPartialSnapshot(original, { date: '2026-01-21', updates: [{ id: 'b', value: 5000 }] });
  assert.equal(result.positions.find(p => p.asset.id === 'b').baseline, true);
  assert.equal(performance(begin, result, 'b'), null);
  assert.equal(periodGain(begin, result), null);
});

test('blank existing value keeps the balance, explicit zero records liquidation, missing selected FX is rejected', () => {
  const original = dataset([begin]);
  const unchanged = buildPartialSnapshot(original, { date: '2026-01-21', updates: [{ id: 'a' }] });
  assert.equal(unchanged.positions[0].value, 10000);
  const zero = buildPartialSnapshot(original, { date: '2026-01-21', updates: [{ id: 'a', value: 0, flows: [{ date: '2026-01-21', amount: -10000 }] }] });
  assert.equal(zero.positions[0].value, 0);
  assert.equal(performance(begin, zero, 'a').gain, 0);
  const foreign = { version: 1, assets: [{ ...asset, currency: 'USD' }], snapshots: [] };
  assert.throws(() => buildPartialSnapshot(foreign, { date: '2026-01-01', updates: [{ id: 'a', value: 1 }] }), /汇率/);
});

test('allocation drill-down splits only its parent slice while every percentage uses the whole portfolio', () => {
  const positions = [
    { asset: { ...asset, id: 'cash', kind: 'savings', category: '活期' }, value: 600 },
    { asset: { ...asset, id: 'btc', region: 'overseas', category: 'BTC' }, value: 100 },
    { asset: { ...asset, id: 'stocks', region: 'overseas', category: '美股' }, value: 200 },
    { asset: { ...asset, id: 'gold', region: 'overseas', category: '黄金' }, value: 100 }
  ];
  const snapshot = { positions, rates: { CNY: 1 } };
  const root = assetAllocation(snapshot), nested = assetAllocation(snapshot, 'overseas-investment');
  assert.equal(root.total, 1000); assert.equal(nested.total, root.total);
  assert.equal(nested.selected.ratio, .4);
  assert.deepEqual(Object.fromEntries(nested.details.map(d => [d.name, d.ratio])), { 美股: .2, BTC: .1, 黄金: .1 });
  assert.equal(nested.details.reduce((sum, d) => sum + d.ratio, 0), nested.selected.ratio);
  assert.equal(root.groups.reduce((sum, g) => sum + g.ratio, 0), 1);
  assert.deepEqual(nested.groups, root.groups);
});

test('allocation aggregates custom categories across currencies and handles zero balances', () => {
  const positions = [
    { asset: { ...asset, id: 'usd', region: 'overseas', currency: 'USD', category: '黄金' }, value: 10 },
    { asset: { ...asset, id: 'cny', region: 'overseas', category: '黄金' }, value: 30 },
    { asset: { ...asset, id: 'cash', kind: 'savings' }, value: 100 }
  ];
  const result = assetAllocation({ positions, rates: { CNY: 1, USD: 7 } }, 'overseas-investment');
  assert.equal(result.total, 200); assert.equal(result.details.length, 1);
  assert.equal(result.details[0].value, 100); assert.equal(result.details[0].ratio, .5);
  assert.equal(result.details[0].assets.length, 2);
  const empty = assetAllocation({ positions: [], rates: { CNY: 1 } }, 'overseas-investment');
  assert.equal(empty.selected.ratio, 0); assert.deepEqual(empty.details, []);
  assert.ok(empty.groups.every(g => g.ratio === 0));
});

test('third allocation level isolates the selected category and aggregates balances by account using the portfolio denominator', () => {
  const row = (id, account, category, value, kind = 'savings') => ({ asset: { ...asset, id, account, category, kind }, value });
  const snapshot = { rates: { CNY: 1 }, positions: [
    row('wx', '微信', '活期', 100), row('ali', '支付宝', '活期', 200),
    row('cmb1', '招行', '活期', 100), row('cmb2', '招行', '活期', 50),
    row('term', '招行', '定期', 150), row('fund', '微信', '活期', 400, 'investment')
  ] };
  const result = assetAllocation(snapshot, 'domestic-savings', '活期');
  assert.equal(result.total, 1000);
  assert.equal(result.selected.ratio, .6); assert.equal(result.category.ratio, .45);
  assert.deepEqual(Object.fromEntries(result.accounts.map(a => [a.name, a.value])), { 支付宝: 200, 招行: 150, 微信: 100 });
  assert.deepEqual(Object.fromEntries(result.accounts.map(a => [a.name, a.ratio])), { 支付宝: .2, 招行: .15, 微信: .1 });
  assert.equal(result.accounts.find(a => a.name === '招行').assets.length, 2);
  assert.equal(result.accounts.reduce((sum, a) => sum + a.value, 0), result.category.value);
});

test('account drill-down converts currencies and safely falls back when a category no longer exists', () => {
  const snapshot = { rates: { CNY: 1, USD: 7 }, positions: [
    { asset: { ...asset, id: 'usd', region: 'overseas', category: '活期', account: '银行 A', currency: 'USD' }, value: 10 },
    { asset: { ...asset, id: 'cny', region: 'overseas', category: '活期', account: '银行 A' }, value: 30 },
    { asset: { ...asset, id: 'other', category: '基金', account: '其他' }, value: 100 }
  ] };
  const result = assetAllocation(snapshot, 'overseas-investment', '活期');
  assert.equal(result.accounts[0].value, 100); assert.equal(result.accounts[0].ratio, .5);
  const missing = assetAllocation(snapshot, 'overseas-investment', '已删除分类');
  assert.equal(missing.category, null); assert.deepEqual(missing.accounts, []);
});

test('overview immediately follows edited asset metadata without changing historical snapshots or monetary data', () => {
  const original = demoData(), saved = structuredClone(original.snapshots);
  const old = saved.at(-1), beforeGain = periodGain(saved.at(-2), old);
  const data = { ...original, assets: original.assets.map(a => a.id === 'demo-bank' ? {
    ...a, name: '新的资产名称', account: '新的账户', category: '新的分类', region: 'overseas', kind: 'investment'
  } : a) };
  const view = overviewSnapshot(data), position = view.positions.find(p => p.asset.id === 'demo-bank');
  assert.deepEqual(position.asset, data.assets.find(a => a.id === 'demo-bank'));
  assert.equal(view.id, old.id); assert.equal(view.date, old.date);
  assert.equal(total(view), total(old)); assert.equal(periodGain(saved.at(-2), view), beforeGain);
  const { asset: ignoredOld, ...oldMonetary } = old.positions.find(p => p.asset.id === 'demo-bank');
  const { asset: ignoredNew, ...viewMonetary } = position;
  assert.deepEqual(viewMonetary, oldMonetary);
  const allocation = assetAllocation(view, 'overseas-investment', '新的分类');
  assert.equal(allocation.accounts[0].name, '新的账户');
  assert.equal(allocation.accounts[0].value, position.value);
  assert.deepEqual(data.snapshots, saved);
  assert.deepEqual(overviewSnapshot(validateData(JSON.parse(JSON.stringify(data)))), view);
});

test('future snapshots carry current metadata for untouched assets while preserving their valuation dates', () => {
  const original = dataset([begin]);
  original.assets[0] = { ...original.assets[0], name: '新名称', category: '新分类', account: '新账户' };
  const next = buildPartialSnapshot(original, { date: '2026-01-21' });
  assert.deepEqual(next.positions[0].asset, original.assets[0]);
  assert.equal(next.positions[0].value, 10000);
  assert.equal(next.positions[0].valuedAt, '2026-01-01');
  assert.equal(original.snapshots[0].positions[0].asset.name, '基金');
  assert.equal(overviewSnapshot(emptyData()), undefined);
});

test('asset search follows the overview hierarchy without mixing accounts or categories across groups', () => {
  const assets = demoData().assets;
  const group = searchAssets(assets, { group: 'domestic-savings' });
  assert.equal(group.matches.length, 3);
  assert.deepEqual(group.categories, [{ name: '活期存款', count: 3 }]);
  const category = searchAssets(assets, { group: 'domestic-savings', category: '活期存款' });
  assert.equal(category.accounts.length, 3);
  const account = searchAssets(assets, { group: 'domestic-savings', category: '活期存款', account: '微信' });
  assert.deepEqual(account.matches.map(a => a.id), ['demo-wechat']);
  const allocation = assetAllocation(overviewSnapshot(demoData()), 'domestic-savings', '活期存款');
  assert.deepEqual(new Set(category.accounts.map(a => a.name)), new Set(allocation.accounts.map(a => a.name)));
});

test('keyword search includes unrecorded assets and normalizes outdated selections without changing data', () => {
  const assets = [...demoData().assets, { ...asset, id: 'pending', name: '未录入黄金', category: '黄金', account: '微信', currency: 'USD' }];
  const before = structuredClone(assets);
  assert.ok(searchAssets(assets, { query: ' usd ' }).matches.some(a => a.id === 'pending'));
  assert.equal(searchAssets(assets, { group: 'domestic-investment', query: '微信' }).matches[0].id, 'pending');
  assert.equal(searchAssets(assets, { query: '不存在的资产' }).matches.length, 0);
  const stale = searchAssets(assets, { group: 'domestic-savings', category: '旧分类', account: '旧账户' });
  assert.equal(stale.selection.category, null); assert.equal(stale.selection.account, null);
  const reset = searchAssets(assets, { group: 'unknown', category: '黄金', account: '微信' });
  assert.equal(reset.selection.group, null); assert.equal(reset.matches.length, assets.length);
  assert.deepEqual(assets, before);
});

test('other combines all positive shares below 1 percent, keeps exactly 1 percent, and preserves totals', () => {
  const nodes = [9800, 100, 50, 49.9, .1].map((value, i) => ({ key: 'item:' + i, name: '项目' + i, value, ratio: value / 10000, children: [] }));
  const result = collapseSmallAllocation(nodes), other = result.find(n => n.type === 'other');
  assert.equal(result.length, 3);
  assert.ok(result.some(n => n.value === 100));
  assert.equal(other.value, 100); assert.equal(other.children.length, 3);
  assert.ok(Math.abs(other.ratio - .01) < 1e-12);
  assert.equal(result.reduce((sum, n) => sum + n.value, 0), 10000);
  assert.ok(other.children.every(n => n.ratio < .01 && n.type !== 'other'));
});

test('threshold uses unrounded shares and synthetic other does not collide with a real category called other', () => {
  const nodes = [
    { key: 'category:其他', name: '其他', value: 9800, ratio: .98, children: [] },
    { key: 'category:临界', name: '临界', value: 99.999, ratio: .0099999, children: [] },
    { key: 'category:保留', name: '保留', value: 100.001, ratio: .0100001, children: [] },
    { key: 'category:零', name: '零', value: 0, ratio: 0, children: [] }
  ];
  const result = collapseSmallAllocation(nodes);
  assert.ok(result.some(n => n.key === 'category:其他'));
  assert.deepEqual(result.find(n => n.key === 'other').children.map(n => n.key), ['category:临界']);
  assert.ok(result.some(n => n.key === 'category:保留'));
  assert.ok(!result.some(n => n.key === 'category:零'));
});

test('every distribution level collapses small siblings using the same portfolio denominator', () => {
  const row = (id, account, category, value, region = 'domestic', kind = 'savings') => ({ asset: { ...asset, id, account, category, region, kind }, value });
  const snapshot = { rates: { CNY: 1 }, positions: [
    row('bank', '招行', '活期', 9860), row('wx', '微信', '活期', 20), row('ali', '支付宝', '活期', 20),
    row('small1', '账户1', '零钱', 20), row('small2', '账户2', '礼金', 30),
    row('overseas1', '海外1', '投资', 20, 'overseas', 'investment'),
    row('overseas2', '海外2', '储蓄', 30, 'overseas')
  ] };
  const original = structuredClone(snapshot), root = allocationHierarchy(snapshot);
  const group = root.children.find(n => n.key === 'group:domestic-savings');
  assert.equal(root.children.find(n => n.type === 'other').value, 50);
  assert.equal(group.children.find(n => n.type === 'other').value, 50);
  const category = group.children.find(n => n.name === '活期');
  const accountOther = category.children.find(n => n.type === 'other');
  assert.equal(accountOther.value, 40); assert.equal(accountOther.ratio, .004);
  assert.deepEqual(new Set(accountOther.children.map(n => n.name)), new Set(['微信', '支付宝']));
  function check(node) {
    assert.ok(Math.abs(node.ratio - node.value / 10000) < 1e-12);
    if (node.children.length) {
      assert.ok(Math.abs(node.children.reduce((sum, n) => sum + n.value, 0) - node.value) < 1e-8);
      for (const child of node.children) check(child);
    }
  }
  check(root); assert.deepEqual(snapshot, original);
});

test('empty allocation remains finite and does not create an empty other branch', () => {
  const root = allocationHierarchy({ rates: { CNY: 1 }, positions: [] });
  assert.equal(root.value, 0); assert.equal(root.ratio, 0); assert.deepEqual(root.children, []);
});
