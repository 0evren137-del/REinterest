import { CURRENCIES, emptyData, today, uid, ordered, latest, total, performance, periodGain, demoData, validateData, deleteAsset, buildPartialSnapshot, overviewSnapshot, searchAssets, allocationHierarchy } from './domain.js';
import { LocalRepository } from './repository.js';

const repository = new LocalRepository();
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let data = emptyData(), personalData = null, demo = false, page = 'overview', draft = null, dirty = false, filter = 'all';
let toastTimer;
let assetSelection = {};
let allocationPath = [];
let editedAssets = new Set(), editedRates = new Set();
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
const money = value => `¥${number(value)}`;
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const percent = value => value === null ? '—' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
const trendClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : '';
const regionName = region => region === 'domestic' ? '国内' : '国外';
const kindName = kind => kind === 'savings' ? '储蓄' : '投资';
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  record: '<path d="M12 4v16M4 12h16"/>',
  assets: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18M16 14h2M7 5V3h10v2"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7M12 7v5l3 2"/>',
  settings: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  arrow: '<path d="m7 17 10-10M7 7h10v10"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  leaf: '<path d="M19 4C9 2 2 7 5 15s16 5 14-11ZM6 18 16 8"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.assets}</svg>`;
const button = (action, label, cls = 'primary', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;

function toast(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  document.querySelector('#toast').classList.add('visible');
  toastTimer = setTimeout(() => document.querySelector('#toast').classList.remove('visible'), 6500);
}
function formError(form, message) {
  const target = form.querySelector('.form-error');
  if (target) { target.textContent = message; target.scrollIntoView({ block: 'nearest' }); }
  else toast(message);
}
async function persist(next) {
  if (demo) data = validateData(next);
  else data = await repository.save(next);
}
function discard() { return !dirty || confirm('本次录入尚未保存，确定离开并放弃修改吗？'); }
function navigate(next) {
  if (!discard()) return;
  dirty = false; draft = null; page = next; render(); window.scrollTo(0, 0);
}

function render() {
  const titles = { overview: ['资产总览', '把生活的积累，慢慢记下来。'], record: ['记录资产', '不必每天记账，按自己的节奏更新。'], assets: ['我的资产', '每一笔积累，都有自己的位置。'], history: ['历史记录', '回看每一个阶段的资产快照。'], settings: ['备份与指南', '数据在你手里，使用也可以很简单。'] };
  const [title, subtitle] = titles[page];
  app.innerHTML = `<aside class="sidebar">
    <a class="brand" href="#" data-action="nav" data-page="overview"><span class="brand-icon">${icon('leaf')}</span><span>有数<span class="brand-en">REINTEREST</span></span></a>
    <div class="workspace-label">我的财务空间</div>
    <nav aria-label="主导航">${Object.entries({ overview: '资产总览', record: '记录资产', assets: '我的资产', history: '历史记录', settings: '备份与指南' }).map(([key, label]) => `<button data-action="nav" data-page="${key}" class="nav-item ${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}>${icon(key)}<span>${label}</span>${page === key ? '<i></i>' : ''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="local-badge"><span class="status-dot"></span>本地离线版 <span>v0.1</span></div><p>慢一点，也能看清成长。</p></div>
  </aside>
  <main><header class="topbar"><span>个人资产手账 <span class="divider">/</span> ${title}</span><span class="privacy">${icon('shield')}仅保存在当前浏览器</span></header>
    <div class="content">${demo ? `<div class="demo-banner"><span><strong>示例体验</strong> · 以下都是虚构数据，修改不会覆盖你的个人记录。</span>${button('exit-demo', '退出示例', 'text-button')}</div>` : ''}
    <div class="page-heading"><div><div class="eyebrow">YOUR MONEY, AT A GLANCE</div><h1>${title}</h1><p>${subtitle}</p></div>${page === 'overview' ? button('nav', `${icon('record')}记录本次资产`, 'primary', 'data-page="record"') : page === 'assets' ? button('add-asset', `${icon('record')}新增资产`) : ''}</div>
    <div id="page-content">${({ overview: overviewView, record: recordView, assets: assetsView, history: historyView, settings: settingsView })[page]()}</div>
    <footer>有数 · 关注积累，也关注生活 <span>离线可用 / 不连接金融账户</span></footer></div></main>`;
}

function emptyView(title, description, actions) {
  return `<section class="empty-state panel"><div class="empty-art">${icon('leaf')}<span>01</span></div><div class="eyebrow">A LITTLE START, A CLEARER PICTURE</div><h2>${title}</h2><p>${description}</p><div class="empty-actions">${actions}</div><div class="empty-steps"><span><b>1</b> 添加资产</span><span><b>2</b> 记录金额</span><span><b>3</b> 观察变化</span></div></section>`;
}
function overviewView() {
  const current = overviewSnapshot(data), snapshots = ordered(data), previous = snapshots.at(-2);
  if (!current) return emptyView(data.assets.length ? '资产清单准备好了，记下第一个起点。' : '从一份资产清单，开始有数。', '银行存款、黄金、基金、海外资产，都可以放在这里。\n第一次只需要记录现在的金额，之后再慢慢看变化。', `${button('nav', data.assets.length ? '记录第一份快照' : '添加我的第一项资产', 'primary', `data-page="${data.assets.length ? 'record' : 'assets'}"`)}${button('demo', '先用示例逛一逛', 'secondary')}`) + `<div class="intro-grid"><div>${icon('assets')}<h3>资产放在哪里，一目了然</h3><p>国内 / 国外，储蓄 / 投资，按自己的习惯分类。</p></div><div>${icon('history')}<h3>想起来时，记录一次就好</h3><p>不固定周期，用每一份快照串起资产变化。</p></div><div>${icon('shield')}<h3>离线使用，自主备份</h3><p>数据留在当前浏览器，可随时导出保存。</p></div></div>`;
  const change = previous ? total(current) - total(previous) : null;
  const gain = periodGain(previous, current);
  const search = assetSearchModel();
  return `<div class="metrics"><section class="total-card"><div class="card-label">${icon('assets')}总资产 <span>CNY</span></div><div class="hero-number">${money(total(current))}</div><div class="total-bottom"><span>记录于 ${current.date}</span><span>已记录 ${snapshots.length} 次 ${icon('arrow')}</span></div><div class="card-decoration"></div></section>
    <section class="metric-card"><div class="card-label">较上次资产变化</div><div class="metric-value ${trendClass(change)}">${change === null ? '—' : signed(change)}</div><p>${previous ? `对比 ${previous.date} · 含资金进出与汇率变化` : '完成第二次记录后显示'}</p></section>
    <section class="metric-card"><div class="card-label">本次更新资产收益 <span class="tag">不含汇率损益</span></div><div class="metric-value ${trendClass(gain)}">${gain === null ? '—' : signed(gain)}</div><p>汇总当天已更新项 · 各项区间始于上次金额更新</p></section></div>
    <div class="dashboard-grid"><section class="panel chart-panel"><div class="panel-heading"><div><h2>资产的时间线</h2><p>含未更新资产的沿用金额</p></div><span class="subtle">人民币折算</span></div>${trendChart(snapshots)}</section>
    <section class="panel allocation-panel"><div class="panel-heading"><div><h2>资产分布</h2><p>大类 → 分类 → 账户 · 所有比例均占总资产</p></div></div><div id="allocation-view" aria-live="polite">${allocation(current)}</div></section></div>
    <section class="panel overview-details"><div class="panel-heading"><div><h2>资产明细 <span class="count" id="overview-visible-count">${search.matches.length}</span></h2><p>本次快照 · ${current.date} · 筛选仅影响下方明细</p></div>${button('nav', '管理资产 →', 'text-button', 'data-page="assets"')}</div>${assetSearchView(search)}${assetTable(current, previous, search)}${assetSearchEmpty(search)}</section>
    <div class="note-line">${icon('shield')}总资产包含沿用金额，未更新项保留原日期。各项收益从上次金额更新起估算，不作年化。</div>`;
}
function trendChart(snapshots) {
  if (snapshots.length === 1) return `<div class="chart-placeholder"><div class="single-point"></div><strong>${money(total(snapshots[0]))}</strong><p>${snapshots[0].date} · 第一个起点已记下</p><span>再记录一次，就能看到资产变化曲线。</span></div>`;
  const list = snapshots.slice(-24), values = list.map(total);
  const low = Math.min(...values), high = Math.max(...values), spread = high - low || Math.max(high * .1, 100);
  const min = Math.max(0, low - spread * .22), max = high + spread * .22;
  const start = Date.parse(list[0].date), duration = Date.parse(list.at(-1).date) - start;
  const points = list.map((s, i) => [70 + (Date.parse(s.date) - start) / duration * 610, 215 - (values[i] - min) / (max - min) * 175]);
  const path = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return `<div class="chart-wrap"><svg viewBox="0 0 720 280" role="img" aria-label="最近 ${list.length} 次记录的总资产趋势"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#72a990" stop-opacity=".25"/><stop offset="100%" stop-color="#72a990" stop-opacity="0"/></linearGradient></defs>${[0, 1, 2, 3].map(i => { const y = 40 + i * 175 / 3; return `<line x1="70" y1="${y}" x2="680" y2="${y}" stroke="#e8ece7" stroke-dasharray="4 5"/><text x="57" y="${y + 4}" text-anchor="end" class="chart-axis">${Math.round((max - i * (max - min) / 3) / 1000)}k</text>`; }).join('')}<polygon points="70,232 ${path} 680,232" fill="url(#area)"/><polyline points="${path}" stroke="#39765e" stroke-width="2.5" fill="none" stroke-linejoin="round"/>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="#39765e" stroke="white" stroke-width="2"><title>${list[i].date} ${money(values[i])}</title></circle>`).join('')}<text x="70" y="266" class="chart-axis">${list[0].date}</text><text x="680" y="266" text-anchor="end" class="chart-axis">${list.at(-1).date}</text></svg></div>`;
}
const groupColors = ['#3d705a', '#91a975', '#aebfac', '#c6ae74'];
const detailColors = ['#2d6658', '#7c9f69', '#c49b58', '#729fa0', '#a086a9', '#b4bd77', '#b97a69', '#6388a1'];
function ringSector(start, ratio) {
  const point = (radius, t) => [80 + radius * Math.cos(t * 2 * Math.PI - Math.PI / 2), 80 + radius * Math.sin(t * 2 * Math.PI - Math.PI / 2)].map(n => n.toFixed(4)).join(',');
  if (ratio >= 1 - 1e-10) return 'M80,12 A68,68 0 1,1 80,148 A68,68 0 1,1 80,12 M80,33 A47,47 0 1,0 80,127 A47,47 0 1,0 80,33 Z';
  const end = start + ratio, large = ratio > .5 ? 1 : 0;
  return 'M' + point(68, start) + ' A68,68 0 ' + large + ',1 ' + point(68, end) + ' L' + point(47, end) + ' A47,47 0 ' + large + ',0 ' + point(47, start) + ' Z';
}
function allocation(current) {
  const root = allocationHierarchy(current);
  const pct = ratio => (ratio > 0 && ratio < .0001 ? '＜0.01' : (ratio * 100).toFixed(ratio > 0 && ratio < .01 ? 2 : 1)) + '%';
  const dot = color => '<svg class="allocation-dot" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="3" fill="' + color + '"/></svg>';
  const trail = [{ node: root, path: [] }];
  let focus = root, validPath = [];
  for (const key of allocationPath) {
    const next = focus.children.find(node => node.key === key);
    if (!next || !next.children.length) break;
    validPath = [...validPath, key]; focus = next; trail.push({ node: next, path: validPath });
  }
  allocationPath = validPath;
  const groupIndex = key => ['group:domestic-savings', 'group:domestic-investment', 'group:overseas-savings', 'group:overseas-investment'].indexOf(key);
  const colorFor = (node, i) => node.type === 'other' ? '#9aa98d' : node.type === 'group' ? groupColors[groupIndex(node.key)] : detailColors[i % detailColors.length];
  const pathData = path => ' data-action="allocation-open" data-path="' + e(JSON.stringify(path)) + '"';
  const slices = [];
  function collect(node, path) {
    node.children.forEach((child, i) => {
      const childPath = [...path, child.key];
      if (path.length < allocationPath.length && allocationPath[path.length] === child.key) collect(child, childPath);
      else slices.push({ node: child, path: childPath, color: colorFor(child, i), muted: path.length !== allocationPath.length });
    });
  }
  collect(root, []);
  let offset = 0;
  const sectors = slices.map(slice => {
    const { node } = slice, start = offset; offset += node.ratio;
    const label = node.name + ' · ' + money(node.value) + ' · 占总资产 ' + pct(node.ratio);
    const canOpen = node.children.length > 0;
    const interaction = canOpen ? pathData(slice.path) + ' role="button" tabindex="0"' : ' role="img"';
    return '<path class="allocation-slice' + (slice.muted ? ' context' : '') + (canOpen ? '' : ' detail') + '" d="' + ringSector(start, node.ratio) + '" fill="' + slice.color + '"' + interaction + ' aria-label="' + e(label + (canOpen ? '，查看明细' : '')) + '"><title>' + e(label) + '</title></path>';
  }).join('');
  const rows = focus.children.map((node, i) => {
    const canOpen = node.children.length > 0;
    const description = node.type === 'other' ? ' · ' + node.children.length + ' 项不足 1%' : '';
    const inner = '<span class="allocation-name">' + dot(colorFor(node, i)) + '<span>' + e(node.name) + '<small>' + e(money(node.value) + description) + '</small></span></span><strong>' + pct(node.ratio) + (canOpen ? '<b>›</b>' : '') + '</strong>';
    if (!canOpen) return '<div class="allocation-detail" title="' + e((node.assets || []).join('、')) + '">' + inner + '</div>';
    return '<button type="button" class="allocation-drill"' + pathData([...allocationPath, node.key]) + ' aria-label="' + e('查看' + node.name + (node.type === 'other' ? '（' + node.children.length + '项不足1%）' : '') + '明细，占总资产' + pct(node.ratio)) + '">' + inner + '</button>';
  }).join('');
  const breadcrumb = trail.map(({ node, path }, i) => i === trail.length - 1 ? '<strong>' + e(node.name) + '</strong>' : '<button type="button" class="allocation-home' + (i === trail.length - 2 ? ' allocation-up' : '') + '"' + pathData(path) + '>' + e(node.name) + '</button>').join('<span>›</span>');
  const level = ['第一层', '第二层', '第三层', '第四层', '第五层', '第六层', '第七层'][allocationPath.length] || '详细层';
  const center = focus.type === 'root' ? (root.value > 0 ? '100%' : '0%') : pct(focus.ratio);
  const explanation = focus.type === 'other' ? '已展开「其他」中的小项，仍以总资产为分母。' : '不足总资产 1% 的项目合并为「其他」，点击后查看。';
  return '<div class="allocation-breadcrumb">' + breadcrumb + '<span class="allocation-level">' + level + '</span></div><div class="allocation-content layered"><div class="donut"><svg viewBox="0 0 160 160" role="group" aria-label="资产分布，始终以总资产为分母"><circle cx="80" cy="80" r="57.5" fill="none" stroke="#edf0e7" stroke-width="21"/>' + sectors + '</svg><div><strong' + (center.length > 5 ? ' class="small-share"' : '') + '>' + center.replace('%', '') + '<small>%</small></strong><span>' + (focus.type === 'root' ? '总资产' : e(focus.name) + ' / 总资产') + '</span></div></div><div class="allocation-legend layered-legend">' + (rows || '<p class="allocation-empty">暂无有金额的资产。</p>') + '</div></div><div class="allocation-context-note">' + explanation + (allocationPath.length ? ' 淡色部分为其余资产。' : '') + '</div><div class="allocation-denominator"><span>固定分母 · 总资产</span><strong>' + money(root.value) + '</strong></div>';
}
function changeAllocation(path = []) {
  allocationPath = Array.isArray(path) ? path : [];
  const current = overviewSnapshot(data), view = document.querySelector('#allocation-view');
  if (!current || !view) return;
  view.innerHTML = allocation(current);
  view.querySelector('.allocation-up, .allocation-home, .allocation-drill')?.focus({ preventScroll: true });
}
app.addEventListener('keydown', event => {
  const target = event.target.closest('path[data-action="allocation-open"]');
  if (target && ['Enter', ' '].includes(event.key)) { event.preventDefault(); changeAllocation(JSON.parse(target.dataset.path)); }
});

function assetTable(current, previous, search = null) {
  const positions = current.positions.filter(p => filter === 'all' || p.asset.region === filter || p.asset.kind === filter);
  const visible = search ? new Set(search.matches.map(a => a.id)) : null;
  return `<div class="table-scroll"><table><thead><tr><th>资产 / 所在账户</th><th>分类</th><th class="numeric">原币金额</th><th class="numeric">折合人民币</th><th class="numeric">本次更新原币收益</th><th class="numeric">区间收益率</th></tr></thead><tbody>${positions.map(p => { const a = p.asset, perf = performance(previous, current, a.id); return `<tr${visible ? ` data-asset-search-item data-asset-id="${e(a.id)}"${visible.has(a.id) ? '' : ' hidden'}` : ''}><td><div class="asset-cell"><span class="asset-icon ${a.kind}">${e(a.name.slice(0, 1))}</span><div><strong>${e(a.name)}</strong><small>${e(a.account)}</small></div></div></td><td><span class="tag">${regionName(a.region)} · ${kindName(a.kind)}</span><small>${e(a.category)}</small></td><td class="numeric">${number(p.value)} <small>${a.currency} · ${p.valuedAt || current.date}${p.valuedAt && p.valuedAt < current.date ? ' · 沿用' : ''}</small></td><td class="numeric"><strong>${money(p.value * current.rates[a.currency])}</strong></td><td class="numeric ${trendClass(perf?.gain)}">${perf ? `${perf.gain > 0 ? '+' : ''}${number(perf.gain)}<small>${a.currency}</small>` : '—'}</td><td class="numeric ${trendClass(perf?.rate)}">${perf ? percent(perf.rate) : p.valuedAt && p.valuedAt < current.date ? '未更新' : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="table-empty">这个分类还没有资产。</td></tr>'}</tbody></table></div>`;
}

function assetSearchSource() {
  return page === 'overview' ? (overviewSnapshot(data)?.positions.map(p => p.asset) || []) : data.assets;
}
function assetSearchModel() {
  const model = searchAssets(assetSearchSource(), assetSelection);
  assetSelection = model.selection;
  return model;
}
function assetSearchSummary(model) {
  let text = '显示 ' + model.matches.length + ' / ' + assetSearchSource().length + ' 项资产';
  if (page === 'record' && editedAssets.size) {
    const visible = new Set(model.matches.map(a => a.id));
    const hidden = [...editedAssets].filter(id => !visible.has(id)).length;
    text += ' · 已修改 ' + editedAssets.size + ' 项' + (hidden ? '（其中 ' + hidden + ' 项在其他筛选中，保存时会一起保存）' : '');
  }
  return text;
}
function assetSearchContent(model) {
  const { selection: selected, groups, categories, accounts } = model;
  const chip = (level, value, label, count, active) => '<button type="button" class="search-chip' + (active ? ' selected' : '') + '" data-action="asset-search-filter" data-level="' + level + '" data-value="' + e(value || '') + '" aria-pressed="' + active + '">' + e(label) + '<b>' + count + '</b></button>';
  const parent = groups.find(g => g.id === selected.group);
  const groupCount = parent?.count || 0;
  const categoryCount = categories.find(c => c.name === selected.category)?.count || 0;
  const path = ['全部资产', parent?.name, selected.category, selected.account].filter(Boolean).map(e).join(' <span>›</span> ');
  return '<div class="asset-search-head"><div><h2>分类检索</h2><p class="asset-search-path">' + path + '</p></div><label class="asset-query-label"><span>搜索资产</span><input id="asset-query" data-asset-query type="search" autocomplete="off" placeholder="搜索名称、分类、账户或币种" value="' + e(selected.query) + '"></label></div><div class="asset-search-row"><span class="search-level-label">大类</span><div>' + chip('group', null, '全部资产', assetSearchSource().length, !selected.group) + groups.map(g => chip('group', g.id, g.name, g.count, selected.group === g.id)).join('') + '</div></div>' + (selected.group ? '<div class="asset-search-row"><span class="search-level-label">分类</span><div>' + chip('category', null, '全部分类', groupCount, !selected.category) + categories.map(c => chip('category', c.name, c.name, c.count, selected.category === c.name)).join('') + '</div></div>' : '<p class="asset-search-tip">选择一个大类，继续按自定义分类和所在账户筛选。</p>') + (selected.category ? '<div class="asset-search-row"><span class="search-level-label">账户</span><div>' + chip('account', null, '全部账户', categoryCount, !selected.account) + accounts.map(a => chip('account', a.name, a.name, a.count, selected.account === a.name)).join('') + '</div></div>' : '') + '<div class="asset-search-bottom"><p id="asset-search-summary" role="status">' + assetSearchSummary(model) + '</p>' + button('asset-search-reset', '清除筛选', 'text-button') + '</div>';
}
function assetSearchView(model) { return '<section class="panel asset-search" id="asset-search" aria-label="资产分类检索">' + assetSearchContent(model) + '</section>'; }
function assetSearchEmpty(model) { return '<div class="panel asset-search-empty" id="asset-search-empty"' + (model.matches.length ? ' hidden' : '') + '><strong>没有找到符合条件的资产</strong><p>' + (page === 'overview' ? '可以换个关键词或清除筛选；总资产和分布图仍显示全部资产。' : '可以换个关键词或清除筛选，所有资产和已填金额都还在。') + '</p>' + button('asset-search-reset', '查看全部资产', 'secondary') + '</div>'; }
function applyAssetFilters(rebuild = false) {
  const model = assetSearchModel(), ids = new Set(model.matches.map(a => a.id));
  for (const item of app.querySelectorAll('[data-asset-search-item]')) item.hidden = !ids.has(item.dataset.assetId);
  const toolbar = document.querySelector('#asset-search');
  if (toolbar && rebuild) toolbar.innerHTML = assetSearchContent(model);
  const summary = document.querySelector('#asset-search-summary');
  if (summary) summary.textContent = assetSearchSummary(model);
  const empty = document.querySelector('#asset-search-empty'); if (empty) empty.hidden = model.matches.length > 0;
  const count = document.querySelector('#record-visible-count'); if (count) count.textContent = model.matches.length + ' 项';
  const overviewCount = document.querySelector('#overview-visible-count'); if (overviewCount) overviewCount.textContent = model.matches.length;
}

function assetsView() {
  if (!data.assets.length) return emptyView('先给你的资产，找一个位置。', '账户、分类可以自由命名。不需要填写银行卡号或任何密码。', button('add-asset', '新增第一项资产'));
  const model = assetSearchModel(), visible = new Set(model.matches.map(a => a.id));
  return `${assetSearchView(model)}<div class="info-banner">资产资料修改后立即同步总览，无需重新记录金额。历史快照保留当时的信息。任何资产都可以删除，删除会同时清除它的全部历史记录并更新统计；清仓但想保留历史时，请将金额记为 0。</div><div class="asset-grid">${data.assets.map(a => { const p = latest(data)?.positions.find(p => p.asset.id === a.id); return `<article class="panel asset-card" data-asset-search-item data-asset-id="${e(a.id)}" ${visible.has(a.id) ? '' : 'hidden'}><div class="asset-card-top"><span class="asset-icon ${a.kind}">${e(a.name.slice(0, 1))}</span><span class="tag">${regionName(a.region)} · ${kindName(a.kind)}</span></div><h2>${e(a.name)}</h2><p>${e(a.account)} · ${e(a.category)}</p><div class="asset-card-value">${p ? number(p.value) : '尚未记录'} <small>${a.currency}</small></div><div class="asset-card-bottom">${button('edit-asset', '编辑', 'text-button', `data-id="${e(a.id)}"`)}${button('delete-asset', '删除', 'text-button muted', `data-id="${e(a.id)}"`)}</div></article>`; }).join('')}</div>${assetSearchEmpty(model)}`;
}
function openAsset(id) {
  const asset = data.assets.find(a => a.id === id);
  const used = asset && data.snapshots.some(s => s.positions.some(p => p.asset.id === id));
  modal.innerHTML = `<form id="asset-form"><div class="modal-heading"><div class="eyebrow">MAKE ROOM FOR YOUR ASSETS</div><h2>${asset ? '编辑资产' : '新增一项资产'}</h2><p>只记录名称和金额，不需要敏感账户信息。</p></div><input type="hidden" name="id" value="${e(id || '')}"><label>资产名称<input name="name" required maxlength="120" placeholder="例如：我的黄金、日常备用金" value="${e(asset?.name)}"></label><div class="form-grid"><label>所在地区<select name="region"><option value="domestic">国内</option><option value="overseas" ${asset?.region === 'overseas' ? 'selected' : ''}>国外</option></select></label><label>资产类型<select name="kind"><option value="savings">储蓄</option><option value="investment" ${asset?.kind === 'investment' ? 'selected' : ''}>投资</option></select></label></div><div class="form-grid"><label>所在账户或平台<input name="account" required maxlength="120" placeholder="例如：招商银行" value="${e(asset?.account)}"></label><label>自定义分类<input name="category" required maxlength="120" list="category-options" placeholder="例如：黄金、基金、活期" value="${e(asset?.category)}"></label></div><datalist id="category-options">${[...new Set(['活期存款', '定期存款', '黄金', '基金', '股票', 'ETF', ...data.assets.map(a => a.category)])].map(c => `<option value="${e(c)}">`).join('')}</datalist><label>记账币种<select name="currency" ${used ? 'disabled' : ''}>${CURRENCIES.map(c => `<option ${asset?.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="field-hint">${used ? '已有历史记录，币种不可修改；不同币种请新建资产。' : '国内 / 国外与币种相互独立。'}</span></label><div class="form-error" role="alert"></div><div class="form-actions">${button('close-modal', '取消', 'secondary')}<button class="primary" type="submit">${asset ? '保存修改' : '添加资产'}</button></div></form>`;
  modal.showModal();
}

function makeDraft(date = today()) {
  editedAssets = new Set(); editedRates = new Set();
  const existing = data.snapshots.find(s => s.date === date);
  const previous = ordered(data).filter(s => s.date < date).at(-1);
  return {
    id: existing?.id || uid(), date, rates: { CNY: 1, ...(previous?.rates || {}), ...(existing?.rates || {}) },
    positions: data.assets.map(asset => {
      const old = existing?.positions.find(p => p.asset.id === asset.id);
      const previousPosition = previous?.positions.find(p => p.asset.id === asset.id);
      return old ? { ...structuredClone(old), asset: { ...asset } } : { asset: { ...asset }, value: previousPosition?.value ?? '', flows: [], income: 0 };
    })
  };
}
function recordView() {
  if (!data.assets.length) return emptyView('先添加资产，再记录金额。', '添加后，每次记录都会自动带出资产清单。', button('nav', '去添加资产', 'primary', 'data-page="assets"'));
  draft ||= makeDraft();
  const model = assetSearchModel(), visible = new Set(model.matches.map(a => a.id));
  const previous = ordered(data).filter(s => s.date < draft.date).at(-1);
  const currencies = [...new Set(data.assets.map(a => a.currency))].filter(c => c !== 'CNY');
  const exists = data.snapshots.some(s => s.date === draft.date);
  return `${assetSearchView(model)}<form id="record-form" novalidate><section class="panel record-meta"><div><label>记录日期<input id="record-date" name="date" type="date" required max="${today()}" value="${draft.date}"></label><span class="field-hint">${exists ? '正在编辑这一天已有的快照' : previous ? `上一次记录：${previous.date}` : '这是第一次记录，将作为收益计算的起点'}</span></div>${currencies.length ? `<div class="exchange-fields"><div class="exchange-tools"><button type="button" class="secondary" data-action="update-rates">联网更新汇率</button><span class="field-hint exchange-source">数据来源：<a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a> · 每日参考汇率</span><span id="exchange-status" class="field-hint" role="status">按记录日期获取参考汇率，保存后生效</span></div><span class="field-hint">本次汇率 · 1 单位外币 = 多少人民币<br>默认沿用上次；同币种资产共用汇率</span>${currencies.map(c => `<label>${c} → CNY<input name="rate-${c}" type="number" min="0.000001" max="1000000" step="any" inputmode="decimal" placeholder="本次涉及再填写" value="${draft.rates[c] ?? ''}"></label>`).join('')}</div>` : '<div class="record-tip">本次全部资产以人民币记录，无需填写汇率。</div>'}</section>
  <div class="record-intro"><h2>${previous ? '更新本次金额' : '记下现在的金额'} <span class="count" id="record-visible-count">${visible.size} 项</span></h2><p>${previous ? '只修改想更新的资产，其他金额自动沿用；未录入的新资产可留空。' : '先填想记录的资产即可，其他留空，下次再记。'}</p></div>
  <div class="record-list">${draft.positions.map(p => { const a = p.asset, old = previous?.positions.find(x => x.asset.id === a.id), startDate = old?.valuedAt || previous?.date; return `<section class="panel record-item" data-asset-search-item ${visible.has(a.id) ? '' : 'hidden'} data-asset-id="${e(a.id)}" data-start-date="${startDate || ''}"><div class="record-row"><div class="asset-cell"><span class="asset-icon ${a.kind}">${e(a.name.slice(0, 1))}</span><div><strong>${e(a.name)}</strong><small>${regionName(a.region)} · ${e(a.account)} · ${e(a.category)}</small></div></div><div class="previous-value">上次金额${old ? ` · ${startDate}` : ''}<strong>${old ? number(old.value) : '首次录入'} <small>${a.currency}</small></strong></div><label class="value-field">本次金额 · ${a.currency}<input name="value" aria-label="${e(a.name)}本次金额" type="number" min="0" max="100000000000000" step="any" inputmode="decimal" value="${p.value}" placeholder="输入当前价值"><span class="field-hint">${p.value !== '' ? `未修改则沿用 · 金额更新于 ${p.valuedAt || (data.snapshots.some(s => s.date === draft.date && s.positions.some(x => x.asset.id === a.id)) ? draft.date : startDate)}` : '可留空，本次不录入'}</span></label></div>
  ${previous ? `<details class="flow-details" ${p.flows.length || p.income || !old ? 'open' : ''}><summary>期间资金进出 / 现金派息 <span>${p.flows.length ? `${p.flows.length} 笔进出` : !old ? '首次金额可直接记录' : '无变动可跳过'}</span></summary><div class="flow-body"><p>只填 ${startDate} 之后、${draft.date} 及之前的记录。买入投入为正，卖出取出为负；资金留在该资产内时不填写。</p><div class="flows">${p.flows.map(f => flowRow(f, startDate, draft.date)).join('')}</div>${button('add-flow', '+ 添加一笔资金进出', 'text-button')}<label class="income-field">已派出、未留在本资产内的利息或分红（${a.currency}）<input name="income" type="number" min="0" max="100000000000000" step="any" value="${p.income}" inputmode="decimal"><span class="field-hint">已包含在本次金额中的利息或分红不要重复填写。收益率估算将派息视为期末发生。</span></label></div></details>` : ''}</section>`; }).join('')}</div>${assetSearchEmpty(model)}
  <div class="info-banner">${previous ? '内部转账：转出资产记负数，转入资产记正数。清仓时本次金额填 0，并补记取出资金，才能正确计算收益。' : '首次填入金额即建立该资产的基准，留空的资产不会记为 0。以后新增资产也可以直接建立基准；想计算新增后的收益时，再补记投入。'}</div><div class="form-error" role="alert"></div><div class="save-bar"><div><strong>只保存本次修改的资产</strong><span>已修改 <b id="edited-count">0</b> 项，其他资产自动保留</span></div><button class="primary" type="submit">${icon('record')}保存修改的资产</button></div></form>`;
}
async function updateExchangeRates(button) {
  const form = button.closest('form'), date = form.elements.date.value;
  if (!form.elements.date.reportValidity()) return;
  const inputs = [...form.querySelectorAll('[name^="rate-"]')];
  const before = new Map(inputs.map(input => [input, input.value]));
  const touched = new Set();
  const track = event => touched.add(event.target);
  form.addEventListener('input', track);
  const status = form.querySelector('#exchange-status');
  button.disabled = true; button.textContent = '正在获取…';
  status.textContent = '正在获取 ' + date + ' 当日或之前最近的参考汇率…';
  try {
    const params = new URLSearchParams({ currencies: inputs.map(i => i.name.slice(5)).join(','), date });
    const response = await fetch('/api/exchange-rates?' + params, { signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '汇率获取失败');
    if (!form.isConnected || form.elements.date.value !== date) return;
    // Validate the whole response before changing any fields.
    if (inputs.some(input => { const c = input.name.slice(5); return !Number.isFinite(result.rates?.[c]) || result.rates[c] <= 0 || result.rates[c] > 1000000 || !/^\d{4}-\d{2}-\d{2}$/.test(result.dates?.[c]) || result.dates[c] > date; })) throw new Error('汇率数据异常，请重试');
    let changed = 0;
    const usedDates = new Set();
    for (const input of inputs) {
      if (touched.has(input) || input.value !== before.get(input)) continue;
      const currency = input.name.slice(5), rate = result.rates[currency];
      input.value = rate.toFixed(rate < 1 ? 4 : 2);
      editedRates.add(currency); dirty = true; changed++;
      usedDates.add(result.dates[currency]);
    }
    status.textContent = changed ? `已填入 ${changed} 种 · Frankfurter 参考日期 ${[...usedDates].sort().join(' / ')} · 保存后生效${changed < inputs.length ? '；保留了获取期间手动修改的值' : ''}` : '保留了获取期间手动修改的汇率';
  } catch (error) {
    if (form.isConnected && form.elements.date.value === date) status.textContent = '获取失败，原汇率未更改。可重试或手动填写。';
  } finally {
    form.removeEventListener('input', track);
    button.disabled = false; button.textContent = '联网更新汇率';
  }
}

function flowRow(flow, start, end) {
  return `<div class="flow-row"><label>发生日期<input name="flow-date" type="date" required min="${nextDate(start)}" max="${end}" value="${flow.date}"></label><label>转入 + / 转出 −<input name="flow-amount" type="number" required step="any" min="-100000000000000" max="100000000000000" inputmode="decimal" placeholder="例如：2000 或 -2000" value="${flow.amount ?? ''}"></label>${button('remove-flow', '移除', 'text-button muted')}</div>`;
}
function nextDate(date) { return new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10); }
function markEdited(section) {
  if (!section) return;
  editedAssets.add(section.dataset.assetId); dirty = true;
  section.classList.add('edited');
  section.querySelector('.value-field .field-hint').textContent = '本次已修改，点击下方保存即可';
  const count = document.querySelector('#edited-count'); if (count) count.textContent = editedAssets.size;
  const summary = document.querySelector('#asset-search-summary'); if (summary) summary.textContent = assetSearchSummary(assetSearchModel());
}
function readDraft(form) {
  if (!form.elements.date.reportValidity()) throw new Error('请选择有效的记录日期');
  if (!editedAssets.size && !editedRates.size) throw new Error('先修改想更新的资产金额，其他资产无需填写');
  const updates = [];
  for (const section of form.querySelectorAll('.record-item')) {
    if (!editedAssets.has(section.dataset.assetId)) continue;
    for (const input of section.querySelectorAll('input')) if (!input.checkValidity()) {
      assetSelection = {}; applyAssetFilters(true); input.reportValidity();
      throw new Error('请检查「' + data.assets.find(a => a.id === section.dataset.assetId).name + '」本次修改的输入');
    }
    const valueText = section.querySelector('[name="value"]').value;
    const flows = [...section.querySelectorAll('.flow-row')].map(row => ({ date: row.querySelector('[name="flow-date"]').value, amount: Number(row.querySelector('[name="flow-amount"]').value) }));
    const income = Number(section.querySelector('[name="income"]')?.value || 0);
    const old = draft.positions.find(p => p.asset.id === section.dataset.assetId);
    if (!valueText && old.value === '' && !flows.length && !income) continue;
    updates.push({ id: section.dataset.assetId, value: valueText === '' ? undefined : Number(valueText), flows, income });
  }
  const currencies = new Set(updates.map(u => data.assets.find(a => a.id === u.id).currency));
  const rates = {};
  for (const currency of new Set([...currencies, ...editedRates])) {
    if (currency === 'CNY') continue;
    const input = form.elements['rate-' + currency];
    if (!input.reportValidity()) throw new Error('请检查 ' + currency + ' 汇率');
    if (!input.value && currencies.has(currency)) throw new Error('请填写本次更新涉及的 ' + currency + ' 汇率');
    if (input.value) rates[currency] = Number(input.value);
  }
  if (!updates.length && !Object.keys(rates).length) throw new Error('没有要保存的修改，请填写想更新的资产，其他资产可以留空');
  return buildPartialSnapshot(data, { date: form.elements.date.value, id: draft.id, updates, rates });
}

function historyView() {
  const snapshots = ordered(data);
  if (!snapshots.length) return emptyView('每一份记录，都会留在这里。', '不要求固定时间，想更新的时候记录一次即可。', button('nav', '记录第一次资产', 'primary', 'data-page="record"'));
  return `<div class="info-banner">快照保存当天的金额、汇率和资产信息。修改或删除历史记录后，后续区间的收益会重新计算；相邻记录的资金进出日期也需要一致。</div><section class="panel"><div class="table-scroll"><table><thead><tr><th>记录日期</th><th class="numeric">总资产（人民币）</th><th class="numeric">较上次变化</th><th>资产数</th><th>操作</th></tr></thead><tbody>${[...snapshots].reverse().map(s => { const index = snapshots.indexOf(s), prev = snapshots[index - 1], delta = prev ? total(s) - total(prev) : null; return `<tr><td><strong>${s.date}</strong>${index === 0 ? '<small>首次基准</small>' : ''}</td><td class="numeric">${money(total(s))}</td><td class="numeric ${trendClass(delta)}">${delta === null ? '—' : signed(delta)}</td><td>${s.positions.length} 项</td><td><div class="row-actions">${button('view-snapshot', '查看', 'text-button', `data-id="${e(s.id)}"`)}${button('edit-snapshot', '编辑', 'text-button', `data-id="${e(s.id)}"`)}${button('delete-snapshot', '删除', 'text-button muted', `data-id="${e(s.id)}"`)}</div></td></tr>`; }).join('')}</tbody></table></div></section>`;
}
function showSnapshot(id) {
  const list = ordered(data), index = list.findIndex(s => s.id === id), s = list[index];
  const savedFilter = filter; filter = 'all';
  modal.innerHTML = `<div class="wide-modal"><div class="modal-heading"><div class="eyebrow">ASSET SNAPSHOT</div><h2>${s.date} 的资产快照</h2><p>总资产 ${money(total(s))} · 历史汇率独立保存</p></div>${assetTable(s, list[index - 1])}<p class="field-hint">区间收益率使用 Modified Dietz 估算，非年化。原币收益不含汇率损益。</p><div class="form-actions">${button('close-modal', '关闭', 'secondary')}</div></div>`;
  filter = savedFilter; modal.showModal();
}
function settingsView() {
  return `<div class="settings-grid"><section class="panel settings-panel"><span class="feature-icon">${icon('settings')}</span><h2>把数据握在自己手里</h2><p>数据保存在这个浏览器、这个网址下。关掉网页再打开还在；换浏览器、清理网站数据或更换网址后不会自动跟随。</p><div class="backup-stats"><span><b>${data.assets.length}</b> 项资产</span><span><b>${data.snapshots.length}</b> 份快照</span></div><div class="button-row">${button('export', '导出 JSON 备份')}${button('import', '从备份恢复', 'secondary')}</div><p class="field-hint">备份是未加密的文件，请保存在自己的安全位置，不要上传到 GitHub。导入会先校验格式，再由你确认替换。</p><input type="file" id="import-file" accept=".json,application/json" hidden></section>
  <section class="panel settings-panel"><span class="feature-icon">${icon('leaf')}</span><h2>先试试，再开始</h2><p>示例数据包含国内储蓄、黄金、基金和海外资产。你可以自由体验，退出后恢复个人数据。</p>${button(demo ? 'exit-demo' : 'demo', demo ? '退出示例' : '进入示例体验', 'secondary')}<div class="offline-note"><span class="status-dot"></span>没有第三方脚本、网络字体或自动接口</div></section></div>
  <section class="panel guide"><h2>几个容易混淆的地方</h2><details open><summary>资产增加，不一定等于赚钱</summary><p>例如上次基金 10,000，本次 12,500，期间投入 2,000，则收益为 500。公式：本次金额 − 上次金额 − 净投入 + 已派出收益。</p></details><details><summary>收益率怎么计算？</summary><p>区间收益率采用 Modified Dietz：收益 ÷（期初金额 + 按持有时间加权的资金进出）。每项资产从它上次实际金额更新日开始计算；未更新项不显示新的收益率。转入越早，参与计算的本金越多。这是区间估算收益率，不是年化；加权本金小于或等于 0 时不显示收益率。已派出收益按期末处理，复杂交易请以券商账单为准。</p></details><details><summary>国外资产与汇率</summary><p>1 美元值 7.1 元人民币时，USD 汇率填 7.1；日元也按 1 日元而不是 100 日元填写。可点击“联网更新汇率”，免费获取记录日期当日或之前最近的参考汇率，实际日期会显示在按钮旁；并非实时交易价。常用币种保留两位小数，小于 1 的汇率保留四位。填入后仍需点击保存才生效；失败可手动填写。仅点击按钮时联网，不上传资产金额或账户信息。原币收益和收益率不包含汇率损益。总资产变化包含汇率变化；首页收益把各项原币收益按本次汇率折算，不等于整个组合的人民币总回报。</p></details><details><summary>转账、买卖和分红怎么记？</summary><p>在两个已建资产之间转账，要在转出项填负数、转入项填正数，日期填实际发生日。资产内的买卖不需要记资金进出。卖出并转走资金时填负数，清仓后的金额填 0。派到资产外的利息或分红填“已派出收益”；接收这笔钱的另一个资产填正数投入，避免两次计为收益。</p></details><details><summary>手机现在能用吗？以后能同步吗？</summary><p>界面已适配手机，但当前服务只在这台电脑本地运行，手机不能直接访问电脑的 localhost。本地版也没有跨设备同步。以后接入云端时会新增登录、云端数据保存和冲突处理，再把本地备份迁移进去。</p></details><details><summary>如何运行、保存代码版本？</summary><p>在项目文件夹双击“打开有数.vbs”，会自动启动后台服务并打开浏览器，无需复制网址。也可以在终端输入 npm start。代码与资产记录相互独立；GitHub 只管理代码。项目 README 中有运行说明和 GitHub 入门步骤。</p></details></section>`;
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  event.preventDefault();
  const { action, id } = target.dataset;
  try {
    if (action === 'nav') navigate(target.dataset.page);
    if (action === 'update-rates') await updateExchangeRates(target);
    if (action === 'add-asset') openAsset();
    if (action === 'edit-asset') openAsset(id);
    if (action === 'delete-asset') {
      const asset = data.assets.find(a => a.id === id);
      if (!asset) return;
      const count = data.snapshots.filter(s => s.positions.some(p => p.asset.id === id)).length;
      const message = count
        ? `确定删除「${asset.name}」？\n\n同时删除它在 ${count} 份历史快照中的金额、资金进出和派息记录，并重新计算历史总资产与收益。其他资产不受影响。\n\n删除后无法直接撤销，已导出的备份不受影响。`
        : `确定删除「${asset.name}」？`;
      if (confirm(message)) {
        await persist(deleteAsset(data, id));
        draft = null;
        render();
        toast(count ? '资产及其历史记录已删除，相关统计已更新' : '资产已删除');
      }
    }
    if (action === 'demo' && discard()) { personalData = structuredClone(data); demo = true; data = demoData(); assetSelection = {}; draft = null; dirty = false; page = 'overview'; render(); }
    if (action === 'exit-demo' && discard()) { data = personalData; personalData = null; demo = false; assetSelection = {}; draft = null; dirty = false; page = 'overview'; render(); }
    if (action === 'asset-search-reset') { assetSelection = {}; applyAssetFilters(true); }
    if (action === 'asset-search-filter') {
      const { level, value } = target.dataset;
      if (level === 'group') assetSelection = { ...assetSelection, group: value || null, category: null, account: null };
      if (level === 'category') assetSelection = { ...assetSelection, category: value || null, account: null };
      if (level === 'account') assetSelection = { ...assetSelection, account: value || null };
      applyAssetFilters(true);
      [...document.querySelectorAll('#asset-search .search-chip')].find(b => b.dataset.level === level && b.dataset.value === value)?.focus({ preventScroll: true });
    }
    if (action === 'filter') { filter = target.dataset.filter; render(); }
    if (action === 'allocation-open') changeAllocation(JSON.parse(target.dataset.path));
    if (action === 'allocation-root') changeAllocation([]);
    if (action === 'add-flow') {
      const previous = ordered(data).filter(s => s.date < draft.date).at(-1);
      target.parentElement.querySelector('.flows').insertAdjacentHTML('beforeend', flowRow({ date: draft.date }, target.closest('.record-item').dataset.startDate || previous.date, draft.date)); markEdited(target.closest('.record-item'));
    }
    if (action === 'remove-flow') { const section = target.closest('.record-item'); target.closest('.flow-row').remove(); markEdited(section); }
    if (action === 'view-snapshot') showSnapshot(id);
    if (action === 'edit-snapshot' && discard()) { draft = makeDraft(data.snapshots.find(s => s.id === id).date); dirty = false; page = 'record'; render(); }
    if (action === 'delete-snapshot' && confirm('确定删除这份快照？后续区间收益会重新计算。建议先导出备份。')) {
      await persist({ ...data, snapshots: data.snapshots.filter(s => s.id !== id) }); render(); toast('快照已删除');
    }
    if (action === 'export') {
      const blob = new Blob([await repository.export(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `reinterest-${demo ? 'demo-' : ''}${today()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('备份已导出，请妥善保存');
    }
    if (action === 'import') document.querySelector('#import-file').click();
  } catch (error) { toast(error.message); }
});
modal.addEventListener('click', event => {
  if (event.target.closest('[data-action="close-modal"]')) modal.close();
});
modal.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.getAttribute('id') !== 'asset-form') return;
  try {
    const fields = new FormData(form), id = fields.get('id');
    const old = data.assets.find(a => a.id === id);
    const asset = { id: id || uid(), name: fields.get('name').trim(), region: fields.get('region'), kind: fields.get('kind'), account: fields.get('account').trim(), category: fields.get('category').trim(), currency: fields.get('currency') || old?.currency };
    const assets = old ? data.assets.map(a => a.id === id ? asset : a) : [...data.assets, asset];
    await persist({ ...data, assets });
    allocationPath = []; filter = 'all'; assetSelection = {}; draft = null;
    modal.close(); render(); toast(old ? '资产已修改，总览已同步' : '资产已添加，接下来可以记录金额');
  } catch (error) { formError(form, error.message); }
});
app.addEventListener('submit', async event => {
  if (event.target.id !== 'record-form') return;
  event.preventDefault();
  const form = event.target;
  try {
    const next = readDraft(form);
    // Same-day partial saves preserve every untouched asset and its cash flows.
    const snapshots = [...data.snapshots.filter(s => s.date !== next.date), next];
    // Validate in both demo and personal mode before displaying success.
    const checked = await repository.import(JSON.stringify({ ...data, snapshots }));
    await persist(checked); dirty = false; draft = null; page = 'overview'; render(); window.scrollTo(0, 0); toast('修改的资产已保存，其他资产保持原金额');
  } catch (error) { formError(form, error.message); }
});
app.addEventListener('input', event => {
  if (event.target.matches('[data-asset-query]')) { assetSelection.query = event.target.value; applyAssetFilters(); return; }
  if (!event.target.closest('#record-form') || event.target.id === 'record-date') return;
  const section = event.target.closest('.record-item');
  if (section) markEdited(section);
  else if (event.target.name?.startsWith('rate-')) { editedRates.add(event.target.name.slice(5)); dirty = true; }
});
app.addEventListener('change', async event => {
  if (event.target.id === 'record-date') {
    const date = event.target.value;
    if (!date || date > today()) { event.target.value = draft.date; toast('请选择不晚于今天的有效日期'); return; }
    if (dirty && !confirm('切换日期会重新载入该日期的录入内容，放弃当前未保存修改吗？')) { event.target.value = draft.date; return; }
    draft = makeDraft(date); dirty = false; render();
  }
  if (event.target.id === 'import-file') {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error('备份文件过大，最大支持 20MB');
      const imported = await repository.import(await file.text());
      if (!confirm(`将以备份中的 ${imported.assets.length} 项资产、${imported.snapshots.length} 份快照替换${demo ? '当前示例' : '当前本地数据'}。请确认已导出原数据备份，是否继续？`)) return;
      await persist(imported); draft = null; dirty = false; render(); toast('备份已恢复');
    } catch (error) { toast(`导入失败：${error.message}`); }
    finally { const input = document.querySelector('#import-file'); if (input) input.value = ''; }
  }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (event.key === 'reinterest.local.v1') toast('另一个标签页已修改数据，请先导出当前备份，再刷新页面。'); });
try { data = await repository.load(); render(); }
catch (error) {
  app.innerHTML = `<div class="startup-error"><h1>本地数据暂时无法读取</h1><p>${e(error.message)}</p><p>原数据没有被覆盖。请勿清理浏览器数据；可尝试回到原浏览器，或联系开发者检查备份。</p><button id="download-raw" class="primary">导出原始数据以便恢复</button></div>`;
  document.querySelector('#download-raw').onclick = () => {
    try {
      const raw = localStorage.getItem('reinterest.local.v1');
      if (!raw) { toast('未找到原始记录'); return; }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `reinterest-recovery-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { toast(cause.message); }
  };
}
