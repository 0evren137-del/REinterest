// Expenses use integer cents throughout allocation and carry-forward calculations.
export const emptyExpenses = () => ({ categories: [
  { id: 'expense-essential', group: '硬开销', name: '生活必需', limits: [] },
  { id: 'expense-enjoyment', group: '软开销', name: '享受消费', limits: [] }
], entries: [] });
export function demoExpenses(month) {
  const data = emptyExpenses();
  data.categories[1].limits = [{ month: addMonths(month, -3), amount: 500 }];
  data.entries = [
    { id: 'demo-watch', categoryId: 'expense-enjoyment', name: 'iWatch', amount: 2400, month: addMonths(month, -1), installments: 12, status: 'purchased', note: '已购分期，后续每月占用 200 元' },
    { id: 'demo-figure', categoryId: 'expense-enjoyment', name: '辉夜手办', amount: 680, month, installments: 1, status: 'purchased', note: '本月享受消费' },
    { id: 'demo-book', categoryId: 'expense-enjoyment', name: '画集', amount: 150, month: addMonths(month, -2), installments: 1, status: 'purchased', note: '' },
    { id: 'demo-trip', categoryId: 'expense-enjoyment', name: '手办预订', mode: 'deposit', amount: 450, depositAmount: 50, month, balanceMonth: addMonths(month, 2), balancePaid: false, installments: 1, status: 'purchased', note: '已付定金 50 元，未来付尾款 400 元' }
  ];
  return data;
}
export const validMonth = value => typeof value === 'string' && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
export function monthIndex(month) { const [year, m] = month.split('-').map(Number); return year * 12 + m - 1; }
export function addMonths(month, count) {
  const index = monthIndex(month) + count;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export const cents = amount => Math.round(amount * 100);
export const expenseMode = entry => entry.mode || (entry.status === 'planned' ? 'deposit' : entry.installments > 1 ? 'installment' : 'paid');
export const expenseModeName = entry => ({ deposit: '定金＋尾款', installment: '分期', paid: '已消费', subscription: '订阅' })[expenseMode(entry)];
export function paymentSchedule(entry, throughMonth, fromMonth = entry.month) {
  if (entry.mode === 'subscription') {
    const start = fromMonth > entry.month ? fromMonth : entry.month;
    const end = [throughMonth || entry.endMonth || entry.month, entry.endMonth || '2199-12'].sort()[0];
    return Array.from({ length: Math.max(0, monthIndex(end) - monthIndex(start) + 1) }, (_, i) => ({ month: addMonths(start, i), amount: cents(entry.amount), phase: 'subscription', planned: false }));
  }
  if (entry.mode === 'deposit') return [
    { month: entry.month, amount: cents(entry.depositAmount), phase: 'deposit', planned: false },
    { month: entry.balanceMonth, amount: cents(entry.amount) - cents(entry.depositAmount), phase: 'balance', planned: !entry.balancePaid }
  ].filter(payment => payment.amount > 0);
  return Array.from({ length: entry.installments }, (_, i) => ({ month: addMonths(entry.month, i), amount: installmentCents(entry, addMonths(entry.month, i)), phase: entry.installments > 1 ? 'installment' : 'paid', planned: entry.status === 'planned' }));
}
const amountValid = value => Number.isFinite(value) && value >= 0 && value <= 1e9 && Math.abs(value * 100 - Math.round(value * 100)) < .0001;
export function validateExpenses(input) {
  if (input === undefined) return emptyExpenses();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
  assert(input && Array.isArray(input.categories) && Array.isArray(input.entries), '开销数据格式无效');
  assert(input.categories.length <= 500 && input.entries.length <= 20000, '开销记录数量超过限制');
  const ids = new Set(), names = new Set();
  for (const category of input.categories) {
    assert(category && text(category.id) && text(category.group) && text(category.name), '开销大类、分类或编号无效');
    const key = JSON.stringify([category.group.trim(), category.name.trim()]);
    assert(!ids.has(category.id) && !names.has(key), '开销分类重复'); ids.add(category.id); names.add(key);
    assert(Array.isArray(category.limits) && category.limits.length <= 3600, '额度记录格式无效');
    const months = new Set();
    for (const limit of category.limits) {
      assert(limit && validMonth(limit.month) && (limit.amount === null || amountValid(limit.amount)) && !months.has(limit.month), '月度额度或生效月份无效');
      months.add(limit.month);
    }
  }
  const entryIds = new Set();
  for (const entry of input.entries) {
    assert(entry && text(entry.id) && !entryIds.has(entry.id) && text(entry.name) && ids.has(entry.categoryId), '消费名称、分类或编号无效');
    entryIds.add(entry.id);
    assert(validMonth(entry.month) && Number.isInteger(entry.installments) && entry.installments >= 1 && entry.installments <= 120 && validMonth(addMonths(entry.month, entry.installments - 1)), '首月或分期期数无效（最多 120 期）');
    assert(amountValid(entry.amount) && cents(entry.amount) >= entry.installments, '消费总额须大于零，且每期至少 0.01 元');
    assert(['purchased', 'planned'].includes(entry.status), '消费状态无效');
    if (entry.mode !== undefined) {
      assert(['deposit', 'installment', 'paid', 'subscription'].includes(entry.mode), '消费模式无效');
      assert(entry.status === 'purchased', '消费模式与状态不一致');
      if (entry.mode === 'deposit') {
        assert(entry.installments === 1 && amountValid(entry.depositAmount) && entry.depositAmount >= 0 && cents(entry.depositAmount) < cents(entry.amount), '定金须大于等于零且小于总额');
        assert(validMonth(entry.balanceMonth) && entry.balanceMonth >= entry.month && typeof entry.balancePaid === 'boolean', '尾款月份不得早于定金月份，尾款支付状态无效');
      }
      if (entry.mode === 'paid') assert(entry.installments === 1, '已消费模式只记录一笔支付');
      if (entry.mode === 'subscription') assert(entry.installments === 1 && (entry.endMonth === null || (validMonth(entry.endMonth) && entry.endMonth >= entry.month)), '订阅结束月份不能早于开始月份；不限期请留空');
    }
    assert(typeof entry.note === 'string' && entry.note.length <= 500, '消费备注最多 500 字');
  }
  const checked = structuredClone(input), used = new Set(checked.entries.map(entry => entry.id));
  checked.entries = checked.entries.flatMap(entry => {
    if (entry.mode !== undefined || entry.status !== 'planned') return [entry];
    // Keep every original due date and cent, including old plans spanning multiple months.
    return paymentSchedule(entry).map((payment, i) => {
      let id = entry.id;
      if (i) {
        const base = `${entry.id.slice(0, 95)}:tail-${i}`;
        id = base;
        for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
        used.add(id);
      }
      return { ...entry, id, mode: 'deposit', status: 'purchased', installments: 1, amount: payment.amount / 100, depositAmount: 0, month: payment.month, balanceMonth: payment.month, balancePaid: false };
    });
  });
  if (checked.entries.length > 20000) throw new Error('转换后的开销记录数量超过限制，请先精简备份中的记录');
  return checked;
}
export function installmentCents(entry, month) {
  if (entry.mode === 'subscription') return month >= entry.month && (!entry.endMonth || month <= entry.endMonth) ? cents(entry.amount) : 0;
  if (entry.mode === 'deposit') return (month === entry.month ? cents(entry.depositAmount) : 0) + (month === entry.balanceMonth ? cents(entry.amount) - cents(entry.depositAmount) : 0);
  const offset = monthIndex(month) - monthIndex(entry.month);
  if (offset < 0 || offset >= entry.installments) return 0;
  const total = cents(entry.amount), base = Math.floor(total / entry.installments);
  return base + (offset < total % entry.installments ? 1 : 0);
}
export function monthlyLimit(category, month) {
  const limit = [...category.limits].filter(limit => limit.month <= month).sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  return limit?.amount == null ? null : cents(limit.amount);
}
export function expenseTimeline(expenses, categoryIds, start, count = 12) {
  const categories = expenses.categories.filter(category => categoryIds.includes(category.id));
  const entries = expenses.entries.filter(entry => categoryIds.includes(entry.categoryId));
  const origin = [...entries.map(entry => entry.month), ...categories.flatMap(category => category.limits.map(limit => limit.month)), start].sort()[0];
  const end = addMonths(start, count - 1), rows = [], debts = new Map();
  // Index installment schedules once; long histories do not rescan every purchase per month.
  const schedules = new Map();
  for (const entry of entries) for (const payment of paymentSchedule(entry, end)) {
    const month = payment.month;
    if (month > end) continue;
    const items = schedules.get(month) || [];
    items.push({ entry, ...payment }); schedules.set(month, items);
  }
  for (let month = origin; month <= end; month = addMonths(month, 1)) {
    const items = schedules.get(month) || [];
    const details = categories.map(category => {
      const spending = items.filter(item => item.entry.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0);
      const limit = monthlyLimit(category, month), carryIn = debts.get(category.id) || 0;
      const carryOut = limit === null ? 0 : Math.max(0, carryIn + spending - limit);
      debts.set(category.id, carryOut);
      return { category, spending, limit, carryIn, carryOut, remaining: limit === null ? null : limit - carryIn - spending };
    });
    if (month < start) continue;
    const sum = key => details.reduce((total, row) => total + (row[key] || 0), 0);
    const limited = details.length > 0 && details.every(row => row.limit !== null);
    rows.push({ month, items, details, spending: sum('spending'), carryIn: sum('carryIn'), carryOut: sum('carryOut'), limit: limited ? sum('limit') : null,
      // Positive balances cannot offset another category's overage.
      remaining: limited ? details.reduce((total, row) => total + Math.max(0, row.remaining), 0) : null });
  }
  return rows;
}
