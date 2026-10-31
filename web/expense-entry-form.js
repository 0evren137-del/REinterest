import { addMonths, cents, expenseMode, installmentCents, validMonth } from './expenses.js';
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `¥${(value / 100).toFixed(2)}`;

export function expenseEntryForm(entry, categories, categoryId, month, fieldsEnd) {
  const mode = entry ? expenseMode(entry) : 'paid';
  return `<form id="expense-entry-form" data-expense-form><div class="modal-heading"><h2>${entry ? '编辑开销' : '记录开销'}</h2><p>选择支付方式，金额会按实际支付安排占用各月额度。</p></div><input type="hidden" name="id" value="${e(entry?.id)}"><label>记录模式<select name="mode"><option value="deposit" ${mode === 'deposit' ? 'selected' : ''}>1 · 预计开支（定金＋尾款）</option><option value="installment" ${mode === 'installment' ? 'selected' : ''}>2 · 分期</option><option value="paid" ${mode === 'paid' ? 'selected' : ''}>3 · 已消费</option><option value="subscription" ${mode === 'subscription' ? 'selected' : ''}>4 · 订阅（每月固定）</option></select></label><label>消费名称<input name="name" required maxlength="120" value="${e(entry?.name)}" placeholder="例如：手办预订、iWatch"></label><label>所属分类<select name="categoryId">${categories.map(c => `<option value="${e(c.id)}" ${(entry?.categoryId || categoryId) === c.id ? 'selected' : ''}>${e(c.group)} / ${e(c.name)}</option>`).join('')}</select></label><div class="form-grid"><label><span id="expense-amount-label">总应付金额（元）</span><input name="amount" type="number" required min="0.01" max="1000000000" step="0.01" value="${entry?.amount ?? ''}"></label><label><span id="expense-payment-month-label">支付月份</span><input name="month" type="month" required min="1900-01" max="2199-12" value="${entry?.month || month}"></label></div><fieldset data-payment-fields="deposit" class="expense-mode-fields"><legend>定金与尾款</legend><div class="form-grid"><label>已付定金（元）<input name="depositAmount" type="number" required min="0" max="1000000000" step="0.01" value="${entry?.depositAmount ?? 0}"></label><label>尾款支付月份<input name="balanceMonth" type="month" required min="1900-01" max="2199-12" value="${entry?.balanceMonth || addMonths(month, 1)}"></label></div><label class="expense-check"><input name="balancePaid" type="checkbox" ${entry?.balancePaid ? 'checked' : ''}>尾款已经支付</label><p class="field-hint">尾款 = 总额 − 定金。支付后勾选，不用再新增一笔消费。</p></fieldset><fieldset data-payment-fields="installment" class="expense-mode-fields"><legend>分期安排</legend><label>期数（含手续费后的总额平均分摊）<input name="installments" type="number" required min="1" max="120" step="1" value="${entry?.installments || 3}"></label></fieldset><fieldset data-payment-fields="subscription" class="expense-mode-fields"><legend>每月自动计入</legend><label>结束月份（可选，含当月）<input name="endMonth" type="month" min="1900-01" max="2199-12" value="${entry?.endMonth || ''}"></label><p class="field-hint">留空表示持续订阅；取消时填写最后一次扣费月份。只保存一条记录，按月计入开销。</p></fieldset><p id="expense-installment-preview" class="info-banner" aria-live="polite"></p><label>备注（可选）<textarea name="note" maxlength="500" rows="2">${e(entry?.note)}</textarea></label>${fieldsEnd}</form>`;
}

export function readExpenseEntry(form, id) {
  const fields = new FormData(form), mode = fields.get('mode');
  const entry = { id, name: fields.get('name').trim(), categoryId: fields.get('categoryId'), amount: Number(fields.get('amount')), month: fields.get('month'), installments: mode === 'installment' ? Number(fields.get('installments')) : 1, status: 'purchased', note: fields.get('note').trim() };
  entry.mode = mode;
  if (mode === 'subscription') entry.endMonth = fields.get('endMonth') || null;
  if (mode === 'deposit') Object.assign(entry, { depositAmount: Number(fields.get('depositAmount')), balanceMonth: fields.get('balanceMonth'), balancePaid: fields.has('balancePaid') });
  return entry;
}

export function updateExpensePreview(form) {
  const mode = form.querySelector('[name="mode"]').value;
  for (const fields of form.querySelectorAll('[data-payment-fields]')) {
    fields.hidden = !fields.dataset.paymentFields.split(' ').includes(mode);
    fields.disabled = fields.hidden;
  }
  form.querySelector('#expense-payment-month-label').textContent = ({ deposit: '定金支付月份', installment: '首期月份', paid: '消费月份', subscription: '订阅开始月份' })[mode];
  form.querySelector('#expense-amount-label').textContent = mode === 'subscription' ? '每月金额（元）' : '总应付金额（元）';
  const entry = readExpenseEntry(form, 'preview'), target = form.querySelector('#expense-installment-preview');
  if (!validMonth(entry.month) || !Number.isFinite(entry.amount) || entry.amount <= 0) { target.textContent = '填写金额与月份后，预览各月占用。'; return; }
  if (mode === 'subscription') {
    target.textContent = entry.endMonth && (!validMonth(entry.endMonth) || entry.endMonth < entry.month) ? '结束月份不能早于开始月份。' : `${entry.month} 起，每月计入 ${money(cents(entry.amount))}，${entry.endMonth ? '至 ' + entry.endMonth + '（含当月）' : '持续至取消'}。未来占用按所选月份之后 12 个月估算。`;
  } else if (mode === 'deposit') {
    if (!validMonth(entry.balanceMonth) || entry.balanceMonth < entry.month || !Number.isFinite(entry.depositAmount) || entry.depositAmount < 0 || entry.depositAmount >= entry.amount) { target.textContent = '定金可为零，但须小于总额，尾款月份不能早于定金月份。'; return; }
    target.textContent = `${entry.month} 已付定金 ${money(cents(entry.depositAmount))}；${entry.balanceMonth} ${entry.balancePaid ? '已付' : '预计支付'}尾款 ${money(cents(entry.amount) - cents(entry.depositAmount))}。只分别占用对应月份，中间月份不计费用。`;
  } else if (mode === 'paid') target.textContent = `${entry.month} 一次计入已消费 ${money(cents(entry.amount))}，不产生未来账单。`;
  else if (Number.isInteger(entry.installments) && entry.installments >= 1 && entry.installments <= 120 && validMonth(addMonths(entry.month, entry.installments - 1))) target.textContent = `${entry.month} 至 ${addMonths(entry.month, entry.installments - 1)} · 共 ${entry.installments} 期；首期 ${money(installmentCents(entry, entry.month))}。按分分摊，总额不重复计入。`;
  else target.textContent = '请填写 1–120 的有效期数。';
}
