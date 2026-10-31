import { addMonths, cents, emptyExpenses, installmentCents, monthlyLimit, validMonth } from './expenses.js';
import { renderExpensePage } from './expenses-pages.js';
import { expenseEntryForm, readExpenseEntry, updateExpensePreview } from './expense-entry-form.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const btn = (action, label, attrs = '', cls = 'text-button') => `<button type="button" class="${cls}" data-action="expense-${action}" ${attrs}>${label}</button>`;

export function createExpenseUI({ getData, persist, render, navigate, modal, toast, today }) {
  let month = today().slice(0, 7), group = '', categoryId = '', query = '', recordMonth = 'all', unsaved = false;
  let trendGroup = '', trendCategoryId = '';
  let chartContext = '', chartOffset = null, chartResizeObserver;
  // Store the horizontal position in month slots so resizing keeps the same months visible.
  function mountCharts() {
    chartResizeObserver?.disconnect();
    const context = `${month}:${document.querySelector('[data-page="expense-budget"][aria-current="page"]') ? 'budget' : 'trend'}`;
    if (context !== chartContext) { chartContext = context; chartOffset = null; }
    for (const frame of document.querySelectorAll('[data-expense-chart-window]')) {
      const viewport = frame.querySelector('.expense-chart-scroll'), slider = frame.querySelector('[data-expense-chart-range]');
      const slotWidth = () => viewport.clientWidth / Number(frame.dataset.visibleMonths);
      const restore = () => {
        viewport.querySelector('svg').style.width = `${slotWidth() * Number(frame.dataset.totalMonths)}px`;
        viewport.scrollLeft = (chartOffset ?? Math.max(0, Number(frame.dataset.selectedIndex) - Number(frame.dataset.initialBefore))) * slotWidth();
      };
      restore();
      const sync = () => {
        chartOffset = viewport.scrollLeft / slotWidth();
        const max = viewport.scrollWidth - viewport.clientWidth;
        slider.disabled = max <= 0;
        slider.value = max > 0 ? String(Math.round(viewport.scrollLeft / max * 1000)) : '0';
      };
      viewport.addEventListener('scroll', sync, { passive: true });
      slider.addEventListener('input', () => { viewport.scrollLeft = Number(slider.value) / 1000 * Math.max(0, viewport.scrollWidth - viewport.clientWidth); chartOffset = viewport.scrollLeft / slotWidth(); });
      sync();
      chartResizeObserver = new ResizeObserver(() => { restore(); sync(); });
      chartResizeObserver.observe(viewport);
    }
  }
  const model = () => getData().expenses || emptyExpenses();
  const categoryLabel = category => `${category.group} / ${category.name}`;
  const fieldsEnd = `<div class="form-error" role="alert"></div><div class="form-actions">${btn('close', '取消', '', 'secondary')}<button class="primary" type="submit">保存</button></div>`;
  function heading(title) {
    const categories = model().categories;
    const groups = [...new Set(categories.map(category => category.group))];
    const isOverview = title === '开销总览';
    return `${!isOverview ? `<h1 class="expense-map-context">${e(title)}</h1>` : ''}<div class="expense-map-scroll"><nav class="expense-map" aria-label="开销分类结构导航"><div class="expense-map-root">${isOverview ? '<h1>' : ''}<button type="button" data-action="nav" data-page="expenses" class="expense-map-home ${isOverview ? 'selected' : ''}" ${isOverview ? 'aria-current="page"' : ''}>开销总览</button>${isOverview ? '</h1>' : ''}</div><div class="expense-map-branches">${groups.map(name => `<div class="expense-map-branch"><div class="expense-map-group">${btn('open', e(name), `data-group="${e(name)}" ${!isOverview && group === name && !categoryId ? 'aria-current="page"' : ''}`, `expense-map-node ${!isOverview && group === name ? 'in-path' : ''} ${!isOverview && group === name && !categoryId ? 'selected' : ''}`)}</div><div class="expense-map-categories">${categories.filter(category => category.group === name).map(category => btn('open', e(category.name), `data-id="${e(category.id)}" ${!isOverview && categoryId === category.id ? 'aria-current="page"' : ''}`, `expense-map-node ${!isOverview && categoryId === category.id ? 'selected' : ''}`)).join('')}</div></div>`).join('') || '<p class="field-hint">暂无分类，请先添加分类。</p>'}</div></nav></div>`;
  }
  function show(html) { modal.innerHTML = html; unsaved = false; modal.showModal(); }
  function close() { if (unsaved && !confirm('开销表单尚未保存，放弃修改吗？')) return; unsaved = false; modal.close(); }
  modal.addEventListener('input', event => { if (event.target.closest('[data-expense-form]')) { unsaved = true; preview(); } });
  modal.addEventListener('change', event => { if (event.target.closest('[data-expense-form]')) { unsaved = true; preview(); } });
  modal.addEventListener('cancel', event => { if (modal.querySelector('[data-expense-form]')) { event.preventDefault(); close(); } });

  function view(page = 'expenses') {
    if (!model().categories.some(category => category.group === group)) group = '';
    if (!model().categories.some(category => category.id === categoryId && (!group || category.group === group))) categoryId = '';
    if (!model().categories.some(category => category.group === trendGroup)) trendGroup = '';
    if (!model().categories.some(category => category.id === trendCategoryId && (!trendGroup || category.group === trendGroup))) trendCategoryId = '';
    return renderExpensePage(model(), { month, group, categoryId, trendGroup, trendCategoryId, query, recordMonth, page, today: today().slice(0, 7) });
  }
  function openEntry(id) {
    if (!model().categories.length) { openCategory(); return; }
    const entry = model().entries.find(entry => entry.id === id);
    show(expenseEntryForm(entry, model().categories, categoryId, month, fieldsEnd));
    preview();
  }
  function preview() {
    const form = modal.querySelector('#expense-entry-form');
    if (form) updateExpensePreview(form);
  }
  function openCategory(id) {
    const category = model().categories.find(category => category.id === id);
    const limit = category ? monthlyLimit(category, month) : null;
    show(`<form id="expense-category-form" data-expense-form><div class="modal-heading"><h2>${category ? '编辑分类与额度' : '新增开销分类'}</h2><p>例如：软开销 → 享受消费，也可以使用自己的分类方式。</p></div><input type="hidden" name="id" value="${e(category?.id)}"><div class="form-grid"><label>大类<input name="group" list="expense-group-options" maxlength="120" required value="${e(category?.group || group)}" placeholder="硬开销 / 软开销"></label><label>分类名称<input name="name" maxlength="120" required value="${e(category?.name)}" placeholder="享受消费"></label></div><datalist id="expense-group-options">${[...new Set(['硬开销', '软开销', ...model().categories.map(category => category.group)])].map(name => `<option value="${e(name)}"></option>`).join('')}</datalist><div class="form-grid"><label>每月额度（元，可留空）<input name="limit" type="number" min="0" max="1000000000" step="0.01" placeholder="不限额" value="${limit === null ? '' : limit / 100}"></label><label>额度生效月份<input name="effectiveMonth" type="month" min="1900-01" max="2199-12" value="${month}" required></label></div><label>额度操作<select name="limitAction"><option value="keep">${category ? '保留现有额度设置（仅修改名称）' : '暂不设置额度'}</option><option value="set" ${category ? '' : 'selected'}>设置 / 替换生效月份的额度</option>${category ? '<option value="remove">删除该生效月份的设置，沿用此前额度</option>' : ''}</select></label><p class="field-hint">调整额度请选择“设置 / 替换”。同月设置会被替换，之后已安排的额度调整仍保留。留空表示从该月起不限额；零表示没有可用额度。</p>${category?.limits.length ? `<div class="expense-limit-history"><strong>已保存的额度调整</strong>${[...category.limits].sort((a, b) => a.month.localeCompare(b.month)).map(limit => `<p>${limit.month} 起：${limit.amount === null ? '不限额' : money(cents(limit.amount))}</p>`).join('')}</div>` : ''}${fieldsEnd}</form>`);
    modal.querySelector('[name="limit"]').addEventListener('input', () => { modal.querySelector('[name="limitAction"]').value = 'set'; });
  }
  async function click(target) {
    const action = target.dataset.action;
    if (!action?.startsWith('expense-')) return false;
    const id = target.dataset.id;
    if (action === 'expense-close') close();
    if (action === 'expense-trend-group') { trendGroup = target.dataset.group || ''; trendCategoryId = ''; render(); }
    if (action === 'expense-trend-category') { trendCategoryId = id || ''; render(); }
    if (action === 'expense-open') { categoryId = id || ''; group = categoryId ? (model().categories.find(category => category.id === id)?.group || '') : target.dataset.group || ''; navigate('expense-detail', { preserveScroll: Boolean(target.closest('.expense-map')) }); }
    if (action === 'expense-records') { query = ''; recordMonth = 'all'; navigate('expense-records'); }
    if (action === 'expense-reset') { group = ''; categoryId = ''; query = ''; recordMonth = 'all'; render(); }
    if (action === 'expense-month' && validMonth(target.dataset.month)) { month = target.dataset.month; render(); }
    if (action === 'expense-group') { group = target.dataset.group; categoryId = ''; render(); }
    if (action === 'expense-filter') { categoryId = id; render(); }
    if (action === 'expense-entry') openEntry(id);
    if (action === 'expense-category') openCategory(id);
    if (action === 'expense-delete-entry') {
      const entry = model().entries.find(entry => entry.id === id);
      if (entry && confirm(`删除「${entry.name}」的完整支付安排？历史开销、未来占用与超额结转会重新计算。`)) {
        await persist({ ...getData(), expenses: { ...model(), entries: model().entries.filter(entry => entry.id !== id) } }); render(); toast('消费已删除，额度已重新计算');
      }
    }
    if (action === 'expense-delete-category') {
      if (model().entries.some(entry => entry.categoryId === id)) { toast('此分类还有消费记录，请先移动到其他分类或删除相关记录。'); return true; }
      const category = model().categories.find(category => category.id === id);
      if (category && confirm(`删除分类「${categoryLabel(category)}」及其额度设置？`)) { await persist({ ...getData(), expenses: { ...model(), categories: model().categories.filter(category => category.id !== id) } }); categoryId = ''; render(); }
    }
    return true;
  }
  async function submit(form) {
    if (!form.matches('[data-expense-form]')) return false;
    const fields = new FormData(form), id = fields.get('id') || crypto.randomUUID();
    let expenses = model();
    if (form.getAttribute('id') === 'expense-entry-form') {
      const entry = readExpenseEntry(form, id);
      expenses = { ...expenses, entries: [...expenses.entries.filter(entry => entry.id !== id), entry] };
    } else {
      const previous = expenses.categories.find(category => category.id === id), effective = fields.get('effectiveMonth'), action = fields.get('limitAction');
      let limits = previous?.limits || [];
      if (action !== 'keep') {
        if (!validMonth(effective)) throw new Error('请选择有效的额度生效月份');
        limits = limits.filter(limit => limit.month !== effective);
        if (action === 'set') limits = [...limits, { month: effective, amount: fields.get('limit') === '' ? null : Number(fields.get('limit')) }];
      }
      const category = { id, group: fields.get('group').trim(), name: fields.get('name').trim(), limits };
      expenses = { ...expenses, categories: [...expenses.categories.filter(category => category.id !== id), category] };
    }
    await persist({ ...getData(), expenses }); unsaved = false; modal.close(); render(); toast('已保存，开销趋势与额度已更新'); return true;
  }
  function change(target) {
    if (!['expense-month', 'expense-group-select', 'expense-category-select', 'expense-record-month', 'expense-query'].includes(target.id)) return false;
    if (target.id === 'expense-month' && validMonth(target.value)) month = target.value;
    if (target.id === 'expense-group-select') { group = target.value; categoryId = ''; }
    if (target.id === 'expense-category-select') categoryId = target.value;
    if (target.id === 'expense-record-month') recordMonth = target.value;
    if (target.id === 'expense-query') { if (query === target.value) return true; query = target.value; }
    render(); return true;
  }
  function input(target) {
    if (target.id !== 'expense-query') return false;
    query = target.value;
    const start = target.selectionStart, end = target.selectionEnd;
    render();
    const search = document.querySelector('#expense-query');
    search.focus({ preventScroll: true });
    if (start !== null) search.setSelectionRange(start, end);
    return true;
  }
  function resetScope() { group = ''; categoryId = ''; query = ''; recordMonth = 'all'; trendGroup = ''; trendCategoryId = ''; }
  const title = () => model().categories.find(category => category.id === categoryId)?.name || group || '分类分析';
  return { view, heading, title, resetScope, click, submit, change, input, mountCharts, isDirty: () => unsaved };
}
