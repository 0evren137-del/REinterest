import test from 'node:test';
import assert from 'node:assert/strict';
import { expensePageModel, renderExpensePage } from '../web/expenses-pages.js';

const expenses = {
  categories: [
    { id: 'joy', group: '软开销', name: '享受消费', limits: [{ month: '2026-10', amount: 500 }] },
    { id: 'food', group: '硬开销', name: '日常饮食', limits: [{ month: '2026-10', amount: 1000 }] },
    { id: 'trip', group: '软开销', name: '旅行', limits: [] }
  ],
  entries: [
    { id: 'watch', name: 'iWatch', categoryId: 'joy', amount: 2400, installments: 12, month: '2026-10', status: 'purchased', note: '' },
    { id: 'figure', name: '辉夜手办', categoryId: 'joy', amount: 680, installments: 1, month: '2026-10', status: 'purchased', note: '' },
    { id: 'dinner', name: '午餐', categoryId: 'food', amount: 100, installments: 1, month: '2026-10', status: 'purchased', note: '' },
    { id: 'holiday', name: '旅行计划', categoryId: 'trip', amount: 800, installments: 1, month: '2026-12', status: 'planned', note: '海边' }
  ]
};
const state = { month: '2026-10', today: '2026-10', group: '', categoryId: '', query: '', recordMonth: 'all', page: 'expenses' };

test('trend scroll range covers six prior months and eight following months with a six-month viewport', () => {
  const result = expensePageModel(expenses, state);
  assert.equal(result.rows.length, 15);
  assert.equal(result.rows[0].month, '2026-04');
  assert.equal(result.rows[6].month, '2026-10');
  assert.equal(result.rows.at(-1).month, '2027-06');
  const html = renderExpensePage(expenses, state);
  assert.match(html, /data-selected-index="6" data-visible-months="6" data-initial-before="2"/);
  assert.equal((html.match(/class="expense-month-column"/g) || []).length, 15);
  const upper = expensePageModel(expenses, { ...state, month: '2199-12' });
  assert.equal(upper.rows.at(-1).month, '2199-12');
  const edge = expensePageModel(expenses, { ...state, month: '1900-01' });
  assert.equal(edge.rows[0].month, '1900-01');
  assert.equal(edge.rows.at(-1).month, '1900-09');
});

test('subscription future occupancy uses a rolling twelve-month horizon and respects cancellation', () => {
  const sub = { id: 'sub', categoryId: 'joy', name: '视频会员', mode: 'subscription', amount: 30, month: '2026-01', endMonth: null, installments: 1, status: 'purchased', note: '' };
  const data = { categories: expenses.categories, entries: [sub] };
  const current = expensePageModel(data, state);
  assert.equal(current.current.spending, 3000); assert.equal(current.future, 36000);
  assert.equal(expensePageModel(data, { ...state, month: '2030-06' }).future, 36000);
  sub.endMonth = '2026-12';
  assert.equal(expensePageModel(data, state).future, 6000);
  assert.match(renderExpensePage(data, state), /订阅按未来 12 个月估算/);
});

test('deposit future totals and colors separate paid deposit from unpaid balance', () => {
  const booking = { id: 'booking', name: '预订测试', categoryId: 'joy', amount: 800, month: '2026-10', mode: 'deposit', depositAmount: 100, balanceMonth: '2026-12', balancePaid: false, installments: 1, status: 'purchased', note: '' };
  const data = { categories: expenses.categories, entries: [booking] };
  const oct = expensePageModel(data, state);
  assert.equal(oct.current.spending, 10000); assert.equal(oct.future, 70000);
  assert.equal(expensePageModel(data, { ...state, month: '2026-11' }).current.spending, 0);
  const html = renderExpensePage(data, { ...state, month: '2026-12', trendCategoryId: 'joy' });
  assert.match(html, /stroke="var\(--expense-planned\)"/);
  assert.match(html, /预订测试 · 消费计划 ¥700\.00/);
  booking.balancePaid = true;
  const paid = renderExpensePage(data, { ...state, month: '2026-12', trendCategoryId: 'joy' });
  assert.match(paid, /stroke="var\(--expense-spent\)"/);
  assert.equal(expensePageModel(data, { ...state, month: '2026-12' }).current.spending, 70000);
});

test('overview always aggregates all categories, independently of a previously opened detail', () => {
  const result = expensePageModel(expenses, { ...state, group: '软开销', categoryId: 'joy' });
  assert.equal(result.current.spending, 98000);
  assert.equal(result.categories.length, 3);
  assert.equal(result.current.carryOut, 38000);
  assert.equal(result.future, 300000);
});
test('category detail has its own trend, budget forecast and item destinations', () => {
  const scoped = { ...state, page: 'expense-detail', group: '软开销', categoryId: 'joy' };
  const result = expensePageModel(expenses, scoped);
  assert.equal(result.current.spending, 88000);
  assert.equal(result.current.limit, 50000);
  assert.equal(result.rows.find(r => r.month === '2026-11').carryIn, 38000);
  assert.equal(result.future, 220000);
  const html = renderExpensePage(expenses, scoped);
  assert.match(html, /具体消费去向/);
  assert.match(html, /iWatch/); assert.match(html, /辉夜手办/);
  assert.doesNotMatch(html, /午餐|旅行计划/);
});
test('group drill-down retains category navigation without mixing other groups', () => {
  const scoped = { ...state, page: 'expense-detail', group: '软开销' };
  const result = expensePageModel(expenses, scoped);
  assert.deepEqual(result.ids, ['joy', 'trip']);
  const html = renderExpensePage(expenses, scoped);
  assert.match(html, /下属分类/); assert.match(html, /data-id="joy"/); assert.match(html, /data-id="trip"/);
  assert.doesNotMatch(html, /日常饮食|午餐/);
});
test('record search and due-month filter do not change trend totals or underlying records', () => {
  const before = structuredClone(expenses);
  const result = expensePageModel(expenses, { ...state, page: 'expense-records', query: 'iWatch', recordMonth: 'current' });
  assert.deepEqual(result.records.map(r => r.id), ['watch']);
  assert.equal(result.current.spending, 98000);
  assert.equal(expensePageModel(expenses, { ...state, page: 'expense-records', month: '2026-11', recordMonth: 'current' }).records.length, 1);
  assert.deepEqual(expenses, before);
});
test('overview and management are separate pages, each with only its relevant controls', () => {
  const overview = renderExpensePage(expenses, state);
  assert.match(overview, /消费去向/); assert.doesNotMatch(overview, /data-action="expense-delete-entry"|data-action="expense-delete-category"/);
  const management = renderExpensePage(expenses, { ...state, page: 'expense-categories' });
  assert.match(management, /data-action="expense-delete-category"/); assert.doesNotMatch(management, /expense-chart-scroll/);
  const records = renderExpensePage(expenses, { ...state, page: 'expense-records' });
  assert.match(records, /data-action="expense-delete-entry"/); assert.doesNotMatch(records, /expense-chart-scroll/);
});

test('overview trend selection changes category spending and forecasts while preserving monthly total', () => {
  const html = renderExpensePage(expenses, { ...state, trendGroup: '软开销', trendCategoryId: 'joy' });
  const summary = html.slice(0, html.indexOf('expense-overview-trend'));
  assert.match(summary, /本月消费总览/); assert.match(summary, /¥980\.00/);
  const chart = html.slice(html.indexOf('expense-trend-summary'), html.indexOf('expense-overview-secondary'));
  assert.match(chart, /享受消费/); assert.match(chart, /¥880\.00/); assert.match(chart, /¥500\.00/);
  assert.match(chart, /2026-11 · 消费 ¥200\.00 · 上月超额 ¥380\.00/);
  assert.match(html, /具体消费项目占比/); assert.doesNotMatch(html, /午餐|旅行计划/);
  const all = renderExpensePage(expenses, { ...state, trendGroup: '', trendCategoryId: '' });
  assert.match(all, /2026-10 · 消费 ¥980\.00/);
});
