import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, emptyExpenses, expenseTimeline, installmentCents, monthlyLimit, validateExpenses, paymentSchedule, expenseMode } from '../web/expenses.js';
import { emptyData, validateData } from '../web/domain.js';
import { LocalRepository } from '../web/repository.js';

const category = (id = 'enjoy', amount = 500) => ({ id, group: '软开销', name: id, limits: [{ month: '2026-01', amount }] });
const entry = (amount, month = '2026-01', extra = {}) => ({ id: crypto.randomUUID(), categoryId: 'enjoy', name: '辉夜手办', amount, month, installments: 1, status: 'purchased', note: '', ...extra });
const rows = (data, start = '2026-01', count = 4) => expenseTimeline(data, data.categories.map(c => c.id), start, count);

test('subscriptions charge the fixed monthly amount across years and remain active beyond 120 months', () => {
  const sub = entry(30, '2026-12', { mode: 'subscription', endMonth: null });
  assert.doesNotThrow(() => validateExpenses({ categories: [category()], entries: [sub] }));
  assert.equal(installmentCents(sub, '2026-11'), 0);
  assert.equal(installmentCents(sub, '2040-01'), 3000);
  assert.deepEqual(paymentSchedule(sub, '2027-02').map(p => [p.month, p.amount]), [['2026-12', 3000], ['2027-01', 3000], ['2027-02', 3000]]);
  assert.deepEqual(rows({ categories: [category()], entries: [sub] }, '2026-11', 4).map(r => r.spending), [0, 3000, 3000, 3000]);
});
test('ending a subscription includes its last month, stops future charges, and preserves overage', () => {
  const sub = entry(600, '2026-01', { mode: 'subscription', endMonth: '2026-02' });
  const result = rows({ categories: [category()], entries: [sub] });
  assert.deepEqual(result.map(r => r.spending), [60000, 60000, 0, 0]);
  assert.deepEqual(result.map(r => r.carryOut), [10000, 20000, 0, 0]);
  assert.equal(installmentCents(sub, '2026-03'), 0);
});
test('subscription backups validate end dates and round trip without expanding recurring records', async () => {
  const data = { ...emptyData(), expenses: { categories: [category()], entries: [entry(19.9, '2026-01', { mode: 'subscription', endMonth: null })] } };
  const repo = new LocalRepository();
  assert.deepEqual((await repo.import(await repo.export(data))).expenses, data.expenses);
  for (const patch of [{ endMonth: '2025-12' }, { endMonth: '2026-13' }, { installments: 3 }, { amount: 0 }]) {
    assert.throws(() => validateExpenses({ categories: [category()], entries: [{ ...data.expenses.entries[0], ...patch }] }));
  }
});

test('deposit and balance occupy separate months with no charge in between', () => {
  const purchase = entry(800, '2026-01', { mode: 'deposit', depositAmount: 100, balanceMonth: '2026-03', balancePaid: false });
  const data = { categories: [category()], entries: [purchase] };
  assert.doesNotThrow(() => validateExpenses(data));
  assert.deepEqual(rows(data).map(r => r.spending), [10000, 0, 70000, 0]);
  assert.equal(rows(data)[2].carryOut, 20000);
  assert.equal(installmentCents(purchase, '2026-03'), 70000);
  assert.deepEqual(paymentSchedule(purchase).map(p => [p.phase, p.planned]), [['deposit', false], ['balance', true]]);
});
test('settling a balance changes payment status without duplicating amount or historical deposit', () => {
  const purchase = entry(800, '2026-01', { mode: 'deposit', depositAmount: 100, balanceMonth: '2026-03', balancePaid: false });
  const before = paymentSchedule(purchase);
  purchase.balancePaid = true;
  assert.deepEqual(paymentSchedule(purchase).map(p => p.amount), before.map(p => p.amount));
  assert.equal(paymentSchedule(purchase)[1].planned, false);
});
test('same-month deposit and balance sum exactly to total, with independent payment statuses', () => {
  const purchase = entry(100.01, '2026-01', { mode: 'deposit', depositAmount: 30.02, balanceMonth: '2026-01', balancePaid: false });
  assert.equal(installmentCents(purchase, '2026-01'), 10001);
  const result = rows({ categories: [category()], entries: [purchase] })[0];
  assert.equal(result.spending, 10001); assert.equal(result.items.length, 2);
});
test('all three modes and legacy records survive backup export and restore', async () => {
  const data = { ...emptyData(), expenses: { categories: [category()], entries: [
    entry(800, '2026-01', { mode: 'deposit', depositAmount: 100, balanceMonth: '2026-03', balancePaid: false }),
    entry(100, '2026-01', { mode: 'installment', installments: 3 }),
    entry(200, '2026-01', { mode: 'paid' }), entry(300, '2026-05', { status: 'planned' })
  ] } };
  const repo = new LocalRepository();
  assert.deepEqual((await repo.import(await repo.export(data))).expenses, validateExpenses(data.expenses));
  assert.equal(expenseMode(data.expenses.entries[3]), 'deposit');
});
test('deposit validation rejects invalid amounts, chronology and payment flags', () => {
  for (const patch of [{ depositAmount: -1 }, { depositAmount: 800 }, { depositAmount: 800.01 }, { depositAmount: 1.001 }, { balanceMonth: '2025-12' }, { balancePaid: 'yes' }, { installments: 2 }, { mode: 'unknown' }, { mode: 'paid', installments: 2 }]) {
    assert.throws(() => validateExpenses({ categories: [category()], entries: [entry(800, '2026-01', { mode: 'deposit', depositAmount: 100, balanceMonth: '2026-03', balancePaid: false, ...patch })] }));
  }
});

test('500 cap: overage occupies next month alongside installments, until fully absorbed', () => {
  const result = rows({ categories: [category()], entries: [entry(700), entry(600, '2026-02', { installments: 3, name: 'iWatch' })] });
  assert.deepEqual(result.map(r => [r.spending, r.carryIn, r.carryOut, r.remaining]), [
    [70000, 0, 20000, 0], [20000, 20000, 0, 10000], [20000, 0, 0, 30000], [20000, 0, 0, 30000]
  ]);
});
test('multi-month debt survives empty months and arbitrary view windows', () => {
  const data = { categories: [category()], entries: [entry(1800)] };
  const result = rows(data);
  assert.deepEqual(result.map(r => r.carryOut), [130000, 80000, 30000, 0]);
  assert.equal(rows(data, '2026-03', 1)[0].carryIn, 80000);
  assert.equal(result[3].remaining, 20000);
});
test('installment cents sum exactly across a year boundary without double counting full price', () => {
  const purchase = entry(100, '2026-12', { installments: 3 });
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map(month => installmentCents(purchase, month)), [0, 3334, 3333, 3333, 0]);
  assert.equal(rows({ categories: [category()], entries: [purchase] }, '2026-12', 3).reduce((sum, r) => sum + r.spending, 0), 10000);
});
test('unused allowance expires, planned purchases occupy cap, separate categories cannot mask overage', () => {
  const data = { categories: [category(), category('hard')], entries: [entry(700, '2026-02', { status: 'planned' })] };
  const result = rows(data);
  assert.equal(result[1].carryOut, 20000);
  assert.equal(result[1].remaining, 50000);
  assert.equal(result[2].carryIn, 20000);
});
test('effective caps preserve history, zero caps carry full debt, unlimited clears debt', () => {
  const c = category();
  c.limits.push({ month: '2026-02', amount: 0 }, { month: '2026-03', amount: null }, { month: '2026-04', amount: 100 });
  const result = rows({ categories: [c], entries: [entry(700), entry(50, '2026-02'), entry(800, '2026-03')] });
  assert.deepEqual(result.map(r => r.carryOut), [20000, 25000, 0, 0]);
  assert.equal(result[2].limit, null);
  assert.equal(result[3].remaining, 10000);
  assert.equal(monthlyLimit(c, '2025-12'), null);
});
test('editing/deleting purchases recomputes past debt and future commitments', () => {
  const data = { categories: [category()], entries: [entry(2400, '2026-01', { installments: 3 })] };
  assert.equal(rows(data)[2].carryOut, 90000);
  data.entries[0].amount = 1200;
  assert.equal(rows(data)[2].carryOut, 0);
  data.entries = [];
  assert.equal(rows(data)[0].spending, 0);
  assert.equal(rows(data)[1].carryIn, 0);
});
test('old backups remain unchanged, expense backups round trip with caps and future plans', async () => {
  const old = { version: 1, assets: [], snapshots: [] };
  assert.deepEqual(validateData(old), old);
  const data = { ...emptyData(), expenses: { categories: [category()], entries: [entry(100, '2027-02', { status: 'planned' })] } };
  const repository = new LocalRepository();
  assert.deepEqual((await repository.import(await repository.export(data))).expenses, validateExpenses(data.expenses));
  assert.equal(emptyExpenses().entries.length, 0);
});

test('legacy plans migrate to zero-deposit balances without changing any monthly amounts', () => {
  const input = { categories: [category()], entries: [entry(100, '2026-12', { status: 'planned', installments: 3, note: '原备注' }), entry(200, '2026-12')] };
  const original = structuredClone(input), before = rows(input, '2026-12', 4);
  const migrated = validateExpenses(input);
  assert.equal(migrated.entries.length, 4);
  for (const item of migrated.entries.slice(0, 3)) {
    assert.equal(item.mode, 'deposit'); assert.equal(item.depositAmount, 0);
    assert.equal(item.balanceMonth, item.month); assert.equal(item.balancePaid, false);
    assert.equal(item.note, '原备注'); assert.equal(paymentSchedule(item).length, 1);
  }
  assert.deepEqual(rows(migrated, '2026-12', 4).map(r => [r.spending, r.carryOut]), before.map(r => [r.spending, r.carryOut]));
  assert.deepEqual(validateExpenses(migrated), migrated);
  assert.deepEqual(input, original);
});
test('repository load persists migrated records once, and subsequent loads do not duplicate them', async () => {
  const input = { ...emptyData(), expenses: { categories: [category()], entries: [entry(300, '2026-12', { status: 'planned' })] } };
  const store = new Map([['reinterest.local.v1', JSON.stringify(input)]]);
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const repo = new LocalRepository(), checked = await repo.load();
  assert.equal(checked.expenses.entries[0].depositAmount, 0);
  assert.equal(JSON.parse(store.get('reinterest.local.v1')).expenses.entries[0].mode, 'deposit');
  assert.deepEqual(await repo.load(), checked);
});
test('malformed imported records are rejected before saving', () => {
  const cases = [
    d => { d.entries[0].categoryId = 'missing'; }, d => { d.entries[0].month = '2026-13'; },
    d => { d.entries[0].amount = -1; }, d => { d.entries[0].amount = 1.001; },
    d => { d.entries[0].installments = 121; }, d => { d.entries[0].status = 'bad'; },
    d => { d.entries.push(d.entries[0]); }, d => { d.categories.push(d.categories[0]); },
    d => { d.categories[0].limits.push({ month: '2026-01', amount: 200 }); },
    d => { d.entries[0].amount = .01; d.entries[0].installments = 2; },
    d => { d.entries[0].month = '2199-12'; d.entries[0].installments = 2; }
  ];
  for (const mutate of cases) {
    const expenses = { categories: [category()], entries: [entry(700)] }; mutate(expenses);
    assert.throws(() => validateExpenses(expenses));
    assert.throws(() => validateData({ ...emptyData(), expenses }));
  }
});
