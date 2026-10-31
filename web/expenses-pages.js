import { addMonths, cents, expenseTimeline, installmentCents, validMonth, paymentSchedule, expenseMode, expenseModeName, monthIndex } from './expenses.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const btn = (action, text, attrs = '', cls = 'text-button') => `<button type="button" class="${cls}" data-action="expense-${action}" ${attrs}>${text}</button>`;
const toneName = { spent: '已购 / 已发生', committed: '未来分期', planned: '消费计划' };
const expenseTone = (entry, month, today, planned = entry.status === 'planned', phase) => planned || (phase === 'subscription' && month > today) ? 'planned' : ['deposit', 'balance', 'subscription'].includes(phase) || expenseMode(entry) === 'paid' ? 'spent' : month > today ? 'committed' : 'spent';
function paymentDescription(entry) {
  if (entry.mode === 'subscription') return `${entry.month} 起 · ${money(cents(entry.amount))} / 月<small>${entry.endMonth ? `至 ${entry.endMonth}（含当月）` : '持续订阅，未设结束月份'}</small>`;
  if (entry.mode === 'deposit') return `${entry.month} 定金 ${money(cents(entry.depositAmount))}<small>${entry.balanceMonth} 尾款 ${money(cents(entry.amount) - cents(entry.depositAmount))} · ${entry.balancePaid ? '已付' : '待付'}</small>`;
  return `${entry.month}<small>${entry.installments > 1 ? `${entry.installments} 期 · 至 ${addMonths(entry.month, entry.installments - 1)}` : expenseModeName(entry)}</small>`;
}
function toneShade(tone, index) {
  if (!index) return `var(--expense-${tone})`;
  const mix = index % 2 ? 'white' : 'black';
  const amount = Math.min(45, 12 + Math.floor((index - 1) / 2) * 8);
  return `color-mix(in srgb, var(--expense-${tone}) ${100 - amount}%, ${mix})`;
}
const nav = (page, text, cls = 'text-button') => `<button type="button" class="${cls}" data-action="nav" data-page="${page}">${text}</button>`;

export function expensePageModel(expenses, { month, page = 'expenses', group = '', categoryId = '', query = '', recordMonth = 'all' }) {
  const overview = page === 'expenses';
  const categories = expenses.categories.filter(c => overview || ((!group || c.group === group) && (!categoryId || c.id === categoryId)));
  const ids = categories.map(c => c.id);
  const start = validMonth(addMonths(month, -6)) ? addMonths(month, -6) : '1900-01';
  const end = validMonth(addMonths(month, 8)) ? addMonths(month, 8) : '2199-12';
  const rows = expenseTimeline(expenses, ids, start, monthIndex(end) - monthIndex(start) + 1);
  const current = rows.find(row => row.month === month) || expenseTimeline(expenses, ids, month, 1)[0];
  const entries = expenses.entries.filter(entry => ids.includes(entry.categoryId));
  const keyword = query.trim().toLocaleLowerCase();
  const records = entries.filter(entry => (recordMonth !== 'current' || installmentCents(entry, month) > 0) && (!keyword || [entry.name, entry.note, categories.find(c => c.id === entry.categoryId)?.name].some(text => text?.toLocaleLowerCase().includes(keyword)))).sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name, 'zh-CN'));
  let future = 0;
  const subscriptionEnd = validMonth(addMonths(month, 12)) ? addMonths(month, 12) : '2199-12';
  for (const entry of entries) for (const payment of paymentSchedule(entry, subscriptionEnd, addMonths(month, 1))) {
    if (payment.month > month) future += payment.amount;
  }
  return { categories, ids, rows, current, entries, records, future, hasSubscriptions: entries.some(entry => entry.mode === 'subscription') };
}

function trend(rows, month, today) {
  const max = Math.max(100, ...rows.map(r => Math.max(r.spending + r.carryIn, r.limit || 0)));
  const height = value => value / max * 145;
  const width = rows.length * 80;
  return `<div class="expense-legend"><span class="spent">已购 / 已发生</span><span class="committed">未来分期</span><span class="planned">待付尾款 / 订阅 / 计划</span><span class="debt">超额结转</span><span>— 月度额度</span></div><div class="expense-chart-window" data-expense-chart-window data-selected-index="${Math.max(0, rows.findIndex(row => row.month === month))}" data-visible-months="6" data-initial-before="2" data-total-months="${rows.length}"><div class="expense-chart-scroll"><svg class="expense-chart" viewBox="0 0 ${width} 230" width="${width}" height="230" preserveAspectRatio="none" role="group" aria-label="当前范围内的月度开销与预计额度趋势">${rows.map((row, i) => {
    const x = 21 + i * 80;
    const sums = { spent: 0, committed: 0, planned: 0 };
    for (const item of row.items) sums[expenseTone(item.entry, row.month, today, item.planned, item.phase)] += item.amount;
    let y = 170;
    const bars = [[row.carryIn, 'debt'], [sums.spent, 'spent'], [sums.committed, 'committed'], [sums.planned, 'planned']].map(([value, cls]) => {
      const h = height(value); y -= h; return `<rect x="${x}" y="${y}" width="38" height="${h}" rx="3" class="${cls}"/>`;
    }).join('');
    return `<a href="#" class="expense-month-column" data-action="expense-month" data-month="${row.month}" aria-label="查看 ${row.month} 开销"><title>${row.month} · 消费 ${money(row.spending)} · 上月超额 ${money(row.carryIn)} · 限额 ${row.limit === null ? '未完整设置' : money(row.limit)}</title>${row.month === month ? `<rect x="${x - 13}" y="8" width="64" height="215" rx="7" fill="#eef4e8"/>` : ''}${bars}${row.limit === null ? '' : `<line x1="${x - 7}" x2="${x + 45}" y1="${170 - height(row.limit)}" y2="${170 - height(row.limit)}" stroke="#526943" stroke-dasharray="4 3"/>`}<text x="${x + 19}" y="${Math.max(15, y - 7)}" text-anchor="middle" class="expense-chart-value">${Math.round((row.spending + row.carryIn) / 100)}</text><text x="${x + 19}" y="197" text-anchor="middle" class="chart-axis">${row.month.slice(5)}月</text><text x="${x + 19}" y="214" text-anchor="middle" class="expense-chart-value">${row.month.slice(0, 4)}</text><rect x="${x - 19}" y="0" width="76" height="230" fill="transparent" class="expense-month-hit"/></a>`;
  }).join('')}</svg></div><div class="expense-chart-navigation"><span>${rows[0].month}</span><input type="range" min="0" max="1000" step="1" value="0" data-expense-chart-range aria-label="拖动查看趋势月份"><span>${rows.at(-1).month}</span></div><p class="expense-chart-hint">拖动查看此范围，点击柱形切换月份；更远月份用上方月份切换。</p></div>`;
}

function destinations(items, categories, byItem = false, month, today) {
  const map = new Map();
  for (const { entry, amount, planned, phase } of items) {
    const category = categories.find(c => c.id === entry.categoryId);
    const tone = expenseTone(entry, month, today, planned, phase);
    // Mixed categories keep separate status slices so plans never inherit a purchased color.
    const key = JSON.stringify([byItem ? entry.id : category.id, tone]);
    const row = map.get(key) || { id: key, tone, name: byItem ? entry.name : category.name, subtitle: `${byItem ? '' : category.group + ' · '}${toneName[tone]}`, value: 0, categoryId: category.id };
    row.value += amount; map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => b.value - a.value);
  const toneIds = Object.fromEntries(Object.keys(toneName).map(tone => [tone, rows.filter(row => row.tone === tone).map(row => row.id).sort()]));
  for (const row of rows) row.color = toneShade(row.tone, toneIds[row.tone].indexOf(row.id));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return '<div class="expense-empty">这个月暂无消费去向。切换月份，或记录一笔消费。</div>';
  let offset = 0;
  const circle = rows.map(row => {
    const ratio = row.value / total;
    const svg = `<circle cx="80" cy="80" r="57" fill="none" stroke="${row.color}" stroke-width="19" stroke-dasharray="${ratio * 358.142} ${358.142 * (1 - ratio)}" stroke-dashoffset="${-offset * 358.142}" transform="rotate(-90 80 80)"><title>${e(row.name)} · ${toneName[row.tone]} ${money(row.value)} ${(ratio * 100).toFixed(1)}%</title></circle>`;
    offset += ratio; return svg;
  }).join('');
  return `<div class="expense-destinations"><div class="expense-ring"><div class="donut"><svg viewBox="0 0 160 160" role="img" aria-label="${byItem ? '具体消费项目' : '消费分类'}占比">${circle}</svg><div><strong>${byItem ? rows.length : new Set(rows.map(row => row.categoryId)).size}</strong><span>项</span></div></div><span class="expense-ring-caption">${byItem ? '消费去向' : '消费分类'}</span></div><div class="expense-destination-list">${rows.map((row, i) => `<div class="expense-destination-row"><svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><rect width="10" height="10" rx="3" fill="${row.color}"/></svg><div>${byItem ? `<strong>${e(row.name)}</strong>` : btn('open', e(row.name), `data-id="${e(row.categoryId)}"`)}<small>${e(row.subtitle)} · ${(row.value / total * 100).toFixed(1)}%</small></div><strong>${money(row.value)}</strong></div>`).join('')}</div></div>`;
}

function metrics(current, future, hasSubscriptions = false) {
  return `<div class="expense-metrics"><section class="total-card"><div class="card-label">${current.month} 消费 / 占用</div><div class="hero-number">${money(current.spending)}</div><p>已消费 + 定金 / 尾款 + 分期 / 订阅</p></section><section class="metric-card"><div class="card-label">本月可用额度</div><div class="metric-value">${current.remaining === null ? '未完整设限' : money(current.remaining)}</div><p>月度额度 ${current.limit === null ? '部分或全部不限额' : money(current.limit)}</p></section><section class="metric-card"><div class="card-label">上月超额累计</div><div class="metric-value ${current.carryIn ? 'expense-warning' : ''}">${money(current.carryIn)}</div><p>预计结转下月 ${money(current.carryOut)}</p></section><section class="metric-card"><div class="card-label">未来占用 / 计划</div><div class="metric-value">${money(future)}</div><p>${hasSubscriptions ? '订阅按未来 12 个月估算，其余按完整安排' : '当前月份之后的全部安排'}</p></section></div>`;
}

function budgetTable(rows, compact = false) {
  return `<div class="table-scroll"><table><thead><tr><th>月份</th><th>预计额度</th><th>上月超额</th><th>消费 / 计划</th><th>剩余可用</th><th>结转下月</th></tr></thead><tbody>${rows.map(row => `<tr><td>${compact ? row.month : btn('month', row.month, `data-month="${row.month}"`)}</td><td>${row.limit === null ? '未完整设置' : money(row.limit)}</td><td>${money(row.carryIn)}</td><td>${money(row.spending)}</td><td>${row.remaining === null ? '—' : money(row.remaining)}</td><td class="${row.carryOut ? 'expense-warning' : ''}">${money(row.carryOut)}</td></tr>`).join('')}</tbody></table></div>`;
}

function categoriesView(model, management = false) {
  return `<div class="expense-category-grid">${model.current.details.map(detail => {
    const c = detail.category;
    const share = model.current.spending > 0 ? detail.spending / model.current.spending : 0;
    return `<article><div class="expense-card-title"><span class="tag">${e(c.group)}</span>${btn('open', '查看分析 →', `data-id="${e(c.id)}"`)}</div><h3>${e(c.name)}</h3><strong>${money(detail.spending)}<small> 本月消费</small></strong><svg class="expense-share-bar" viewBox="0 0 300 6" preserveAspectRatio="none" aria-label="当前范围内消费占比 ${(share * 100).toFixed(1)}%"><rect width="300" height="6" rx="3" fill="#eef2e8"/><rect width="${share * 300}" height="6" rx="3" fill="#7d9d6b"/></svg><p>月度额度 ${detail.limit === null ? '不限额' : money(detail.limit)} · 结转 ${money(detail.carryOut)}</p>${management ? `${btn('category', '编辑分类 / 额度', `data-id="${e(c.id)}"`)}${btn('delete-category', '删除', `data-id="${e(c.id)}"`)}` : `<p>${detail.remaining === null ? '尚未设置额度' : `剩余可用 ${money(Math.max(0, detail.remaining))}`}</p>`}</article>`;
  }).join('') || '<div class="expense-empty">还没有分类，先添加一个分类。</div>'}</div>`;
}

function filters(expenses, state, records = false) {
  const groups = [...new Set(expenses.categories.map(c => c.group))];
  return `<section class="panel expense-manage-filters"><label>大类<select id="expense-group-select"><option value="">全部大类</option>${groups.map(name => `<option value="${e(name)}" ${state.group === name ? 'selected' : ''}>${e(name)}</option>`).join('')}</select></label><label>分类<select id="expense-category-select"><option value="">全部分类</option>${expenses.categories.filter(c => !state.group || c.group === state.group).map(c => `<option value="${e(c.id)}" ${state.categoryId === c.id ? 'selected' : ''}>${e(c.group)} / ${e(c.name)}</option>`).join('')}</select></label>${records ? `<label>记录范围<select id="expense-record-month"><option value="all">所有月份</option><option value="current" ${state.recordMonth === 'current' ? 'selected' : ''}>所选月份应付</option></select></label><label class="expense-query">搜索消费<input id="expense-query" type="search" value="${e(state.query)}" placeholder="搜索名称或备注"></label>` : ''}${btn('reset', '清除筛选')}</section>`;
}

function overviewTrendFilters(expenses, group, categoryId) {
  const groups = [...new Set(expenses.categories.map(c => c.group))];
  const chip = (action, text, attrs, selected) => btn(action, text, `${attrs} aria-pressed="${selected}"`, `search-chip ${selected ? 'selected' : ''}`);
  return `<div class="expense-trend-filters" role="group" aria-label="趋势分类选择"><div class="expense-filter-line"><span>大类</span>${chip('trend-group', '全部开销', 'data-group=""', !group && !categoryId)}${groups.map(name => chip('trend-group', e(name), `data-group="${e(name)}"`, group === name)).join('')}</div><div class="expense-filter-line"><span>分类</span>${chip('trend-category', group ? '该大类全部' : '全部分类', 'data-id=""', !categoryId)}${expenses.categories.filter(c => !group || c.group === group).map(c => chip('trend-category', e(group ? c.name : `${c.group} / ${c.name}`), `data-id="${e(c.id)}"`, categoryId === c.id)).join('')}</div></div>`;
}

function overview(expenses, state, totalModel, toolbar) {
  const group = expenses.categories.some(c => c.group === state.trendGroup) ? state.trendGroup : '';
  const category = expenses.categories.find(c => c.id === state.trendCategoryId && (!group || c.group === group));
  const selected = expensePageModel(expenses, { ...state, page: 'expense-detail', group, categoryId: category?.id || '' });
  const scopeName = category?.name || group || '全部开销';
  const next = expenseTimeline(expenses, selected.ids, state.month, validMonth(addMonths(state.month, 3)) ? 4 : 1);
  return `<div class="expense-overview">${toolbar}<div class="expense-overview-label"><h2>本月消费总览</h2><span>${state.month} · 全部分类</span></div>${metrics(totalModel.current, totalModel.future, totalModel.hasSubscriptions)}
    <div class="expense-analysis-grid expense-main-analysis"><section class="panel expense-trend expense-overview-trend"><div class="panel-heading"><div><h2>过去与未来 · 开销趋势</h2><p>点击顶部类别直接对比变化</p></div></div><div class="expense-trend-summary"><strong>${e(scopeName)}</strong><span>${state.month} 消费 <b>${money(selected.current.spending)}</b></span><span>月度额度 <b>${selected.current.limit === null ? '未完整设限' : money(selected.current.limit)}</b></span><span>可用 <b>${selected.current.remaining === null ? '—' : money(selected.current.remaining)}</b></span><span>预计结转 <b>${money(selected.current.carryOut)}</b></span></div>${trend(selected.rows, state.month, state.today)}</section>
    <section class="panel expense-distribution"><div class="panel-heading"><div><h2>${state.month} · ${e(scopeName)}消费去向</h2><p>${category ? '具体项目占比，分期按当月应付统计' : '按分类查看消费占比'}</p></div></div>${destinations(selected.current.items, selected.categories, Boolean(category), state.month, state.today)}</section></div><div class="expense-overview-secondary"><section class="panel expense-ledger"><div class="panel-heading"><div><h2>${e(scopeName)} · 未来额度</h2><p>随上方分类同步切换，含分期与超额累计</p></div></div>${budgetTable(next, true)}</section></div></div>`;
}

export function renderExpensePage(expenses, state) {
  const { month, page, today } = state;
  const model = expensePageModel(expenses, state);
  const { current, rows, future, categories } = model;
  const scoped = page === 'expense-detail';
  const category = state.categoryId ? categories.find(c => c.id === state.categoryId) : null;
  const breadcrumb = scoped ? `<div class="expense-breadcrumb">${nav('expenses', '全部开销')}<span>›</span>${category ? `${btn('open', e(category.group), `data-group="${e(category.group)}"`)}<span>›</span><strong>${e(category.name)}</strong>` : `<strong>${e(state.group || '全部分类')}</strong>`}</div>` : '';
  const toolbar = `<div class="expense-toolbar"><div class="expense-month-controls">${btn('month', '‹', `data-month="${addMonths(month, -1)}" aria-label="上个月"`, 'secondary')}<label>查看月份<input id="expense-month" type="month" min="1900-01" max="2199-12" value="${month}"></label>${btn('month', '›', `data-month="${addMonths(month, 1)}" aria-label="下个月"`, 'secondary')}${btn('month', '本月', `data-month="${today}"`)}</div><div class="button-row">${page === 'expense-categories' ? btn('category', '＋ 新增分类', '', 'primary') : page === 'expense-records' ? btn('entry', '＋ 记录开销', '', 'primary') : scoped ? btn('records', '查看该类记录', '', 'secondary') + btn('entry', '＋ 记录消费', '', 'primary') : ''}</div></div>`;
  if (page === 'expenses') return overview(expenses, state, model, toolbar);
  if (page === 'expense-records') {
    return `${toolbar}${filters(expenses, state, true)}<section class="panel expense-all"><div class="panel-heading"><div><h2>开销记录 <span class="count">${model.records.length}</span></h2><p>编辑整笔消费，分期与额度自动重算；筛选不会改变其他记录。</p></div></div>${model.records.length ? `<div class="table-scroll"><table><thead><tr><th>消费 / 去向</th><th>模式</th><th>总额</th><th>支付安排</th><th>所选月应付</th><th>操作</th></tr></thead><tbody>${model.records.map(entry => {
      const c = categories.find(c => c.id === entry.categoryId);
      return `<tr><td><strong>${e(entry.name)}</strong><small class="expense-cell-note">${e(c.group)} / ${e(c.name)}${entry.note ? ` · ${e(entry.note)}` : ''}</small></td><td>${expenseModeName(entry)}</td><td>${money(cents(entry.amount))}${entry.mode === 'subscription' ? ' / 月' : ''}</td><td>${paymentDescription(entry)}</td><td>${money(installmentCents(entry, month))}</td><td>${btn('entry', '编辑', `data-id="${e(entry.id)}"`)}${btn('delete-entry', '删除', `data-id="${e(entry.id)}"`)}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="expense-empty">暂无匹配的消费。可以新增记录，或清除筛选。</div>'}</section>`;
  }
  if (page === 'expense-categories') return `${toolbar}${filters(expenses, state)}<section class="panel expense-budgets"><div class="panel-heading"><div><h2>分类与月度额度</h2><p>管理大类、分类和额度。点击“查看分析”进入分类独立看板。</p></div></div>${categoriesView(model, true)}</section>`;
  if (page === 'expense-budget') {
    const forecast = expenseTimeline(expenses, model.ids, month, validMonth(addMonths(month, 11)) ? 12 : 1);
    return `${toolbar}${filters(expenses, state)}${metrics(current, future, model.hasSubscriptions)}<section class="panel expense-trend"><div class="panel-heading"><div><h2>未来 12 个月 · 额度与占用</h2><p>范围内各分类独立结转，未用完的额度不累计。未来按已录入消费及计划推演。</p></div>${nav('expense-categories', '设置额度 →')}</div>${trend(forecast, month, today)}</section><section class="panel expense-ledger">${budgetTable(forecast)}</section>`;
  }
  const scopeName = scoped ? category?.name || state.group || '分类' : '全部开销';
  const next = expenseTimeline(expenses, model.ids, month, validMonth(addMonths(month, 3)) ? 4 : 1);
  return `${toolbar}<div class="expense-overview-label"><h2>${e(scopeName)}消费总览</h2><span>${month} · 当前分类</span></div>${metrics(current, future, model.hasSubscriptions)}<div class="expense-analysis-grid"><section class="panel expense-trend"><div class="panel-heading"><div><h2>${e(scopeName)} · 趋势与预计额度</h2><p>按月应付统计 · 点击月份查看对应去向</p></div></div>${trend(rows, month, today)}</section><section class="panel expense-distribution"><div class="panel-heading"><div><h2>${month} · ${scoped ? '具体消费去向' : '开销去向'}</h2><p>${scoped ? '每笔具体消费占比，分期仅计本月应付' : '按分类查看占比，点击分类进入独立分析'}</p></div></div>${destinations(current.items, categories, Boolean(state.categoryId), month, today)}</section></div>
    ${scoped && !state.categoryId ? `<section class="panel expense-budgets"><div class="panel-heading"><div><h2>下属分类</h2><p>继续进入分类，查看具体消费去向</p></div></div>${categoriesView(model)}</section>` : ''}${scoped ? `<section class="panel expense-ledger"><div class="panel-heading"><div><h2>${e(scopeName)} · 当前与未来额度</h2><p>上月超额与分期占用均已扣除</p></div>${category ? btn('category', '调整该类额度', `data-id="${e(category.id)}"`) : ''}</div>${budgetTable(next, true)}</section><section class="panel expense-details"><div class="panel-heading"><div><h2>${month} · 消费明细</h2><p>显示当前类别的具体项目与分期进度</p></div>${btn('records', '管理该类记录 →')}</div>${current.items.length ? `<div class="table-scroll"><table><thead><tr><th>消费项目</th><th>本月应付</th><th>支付方式 / 进度</th><th>操作</th></tr></thead><tbody>${current.items.map(({entry, amount, phase, planned}) => `<tr><td><strong>${e(entry.name)}</strong><small class="expense-cell-note">${phase === 'deposit' ? '本月定金 · ' : phase === 'balance' ? (planned ? '本月待付尾款 · ' : '本月已付尾款 · ') : ''}${e(entry.note)}</small></td><td>${money(amount)}</td><td>${expenseModeName(entry)}<small>${paymentDescription(entry)}</small></td><td>${btn('entry', '编辑', `data-id="${e(entry.id)}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="expense-empty">这个月没有消费记录。</div>'}</section>` : `<section class="panel expense-budgets"><div class="panel-heading"><div><h2>按类别继续查看</h2><p>每个类别都有独立的趋势、额度预测和消费去向</p></div>${nav('expense-categories', '管理分类 →')}</div><div class="expense-group-links">${[...new Set(categories.map(c => c.group))].map(group => btn('open', `${e(group)} →`, `data-group="${e(group)}"`, 'search-chip')).join('')}</div>${categoriesView(model)}</section>`}`;
}
