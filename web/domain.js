export const SCHEMA_VERSION = 1;
export const CURRENCIES = ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD'];
export const ASSET_GROUPS = [
  ['domestic-savings', '国内储蓄', 'domestic', 'savings'],
  ['domestic-investment', '国内投资', 'domestic', 'investment'],
  ['overseas-savings', '国外储蓄', 'overseas', 'savings'],
  ['overseas-investment', '国外投资', 'overseas', 'investment']
];

export function searchAssets(assets, selection = {}) {
  const groups = ASSET_GROUPS.map(([id, name, region, kind]) => ({
    id, name, count: assets.filter(a => a.region === region && a.kind === kind).length
  }));
  const group = groups.some(g => g.id === selection.group) ? selection.group : null;
  const inGroup = group ? assets.filter(a => `${a.region}-${a.kind}` === group) : assets;
  const options = (list, key) => [...new Set(list.map(a => a[key]))].sort((a, b) => a.localeCompare(b, 'zh-CN')).map(name => ({ name, count: list.filter(a => a[key] === name).length }));
  const categories = group ? options(inGroup, 'category') : [];
  const category = categories.some(c => c.name === selection.category) ? selection.category : null;
  const inCategory = category ? inGroup.filter(a => a.category === category) : inGroup;
  const accounts = category ? options(inCategory, 'account') : [];
  const account = accounts.some(a => a.name === selection.account) ? selection.account : null;
  const query = typeof selection.query === 'string' ? selection.query : '';
  const keyword = query.trim().toLocaleLowerCase();
  const matches = inCategory.filter(a => (!account || a.account === account) && (!keyword || [a.name, a.account, a.category, a.currency].some(value => value.toLocaleLowerCase().includes(keyword))));
  return { groups, categories, accounts, selection: { group, category, account, query }, matches };
}
export const emptyData = () => ({ version: SCHEMA_VERSION, assets: [], snapshots: [] });
export const uid = () => crypto.randomUUID();
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const ordered = data => [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
export const latest = data => ordered(data).at(-1);
// Current views use the asset list's metadata; saved snapshots stay historical.
export function overviewSnapshot(data) {
  const snapshot = latest(data);
  if (!snapshot) return undefined;
  const assets = new Map(data.assets.map(asset => [asset.id, asset]));
  return {
    ...snapshot,
    positions: snapshot.positions.map(position => ({
      ...position, asset: { ...(assets.get(position.asset.id) || position.asset) }
    }))
  };
}
export const total = snapshot => snapshot ? snapshot.positions.reduce((sum, p) => sum + p.value * snapshot.rates[p.asset.currency], 0) : 0;

// Every level uses the same total, including categories inside the selected group.
export function assetAllocation(snapshot, groupId = null, categoryName = null) {
  const sum = total(snapshot);
  const groups = ASSET_GROUPS.map(([id, name, region, kind]) => {
    const positions = snapshot.positions.filter(p => p.asset.region === region && p.asset.kind === kind);
    const value = positions.reduce((s, p) => s + p.value * snapshot.rates[p.asset.currency], 0);
    return { id, name, positions, value, ratio: sum > 0 ? value / sum : 0 };
  });
  const selected = groups.find(g => g.id === groupId) || null;
  const byCategory = new Map();
  for (const p of selected?.positions || []) {
    const name = p.asset.category;
    const row = byCategory.get(name) || { name, value: 0, assets: [] };
    row.value += p.value * snapshot.rates[p.asset.currency];
    row.assets.push(p.asset.name);
    byCategory.set(name, row);
  }
  const details = [...byCategory.values()].map(row => ({ ...row, ratio: sum > 0 ? row.value / sum : 0 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'));
  const category = details.find(row => row.name === categoryName) || null;
  const byAccount = new Map();
  for (const p of category ? selected.positions.filter(p => p.asset.category === category.name) : []) {
    const name = p.asset.account;
    const row = byAccount.get(name) || { name, value: 0, assets: [] };
    row.value += p.value * snapshot.rates[p.asset.currency];
    row.assets.push(p.asset.name);
    byAccount.set(name, row);
  }
  const accounts = [...byAccount.values()].map(row => ({ ...row, ratio: sum > 0 ? row.value / sum : 0 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'));
  return { total: sum, groups, selected, details, category, accounts };
}

// Group by the unrounded share of the full portfolio, never the parent share.
export function collapseSmallAllocation(nodes) {
  const positive = nodes.filter(node => node.value > 0);
  const small = positive.filter(node => node.ratio < .01);
  if (!small.length) return positive;
  return [...positive.filter(node => node.ratio >= .01), {
    key: 'other', name: '其他', type: 'other',
    value: small.reduce((sum, node) => sum + node.value, 0),
    ratio: small.reduce((sum, node) => sum + node.ratio, 0),
    children: small
  }];
}

export function allocationHierarchy(snapshot) {
  const model = assetAllocation(snapshot);
  const ratio = value => model.total > 0 ? value / model.total : 0;
  const groups = model.groups.map(group => {
    const categories = new Map();
    for (const p of group.positions) {
      let category = categories.get(p.asset.category);
      if (!category) {
        category = { key: 'category:' + p.asset.category, name: p.asset.category, type: 'category', value: 0, accounts: new Map() };
        categories.set(p.asset.category, category);
      }
      const value = p.value * snapshot.rates[p.asset.currency];
      category.value += value;
      const account = category.accounts.get(p.asset.account) || {
        key: 'account:' + p.asset.account, name: p.asset.account, type: 'account', value: 0, assets: [], children: []
      };
      account.value += value;
      account.assets.push(p.asset.name);
      category.accounts.set(account.name, account);
    }
    const children = [...categories.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN')).map(category => {
      const accounts = [...category.accounts.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN')).map(account => ({ ...account, ratio: ratio(account.value) }));
      return { key: category.key, name: category.name, type: 'category', value: category.value, ratio: ratio(category.value), children: collapseSmallAllocation(accounts) };
    });
    return { key: 'group:' + group.id, name: group.name, type: 'group', value: group.value, ratio: group.ratio, children: collapseSmallAllocation(children) };
  });
  return { key: 'root', name: '全部资产', type: 'root', value: model.total, ratio: model.total > 0 ? 1 : 0, children: collapseSmallAllocation(groups) };
}
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

// Modified Dietz: capital is weighted by how long each dated flow was invested.
// Returned income is money paid outside this asset; retained dividends stay in value.
export function performance(previous, current, id) {
  const end = current.positions.find(p => p.asset.id === id);
  const start = previous?.positions.find(p => p.asset.id === id);
  if (!previous || !end || end.baseline || (end.valuedAt && end.valuedAt < current.date)) return null;
  const beginning = start?.value ?? 0;
  const duration = days(start?.valuedAt || previous.date, current.date);
  if (duration <= 0) return null;
  const flows = end.flows || [];
  const net = flows.reduce((sum, f) => sum + f.amount, 0);
  const gain = end.value - beginning - net + (end.income || 0);
  const capital = beginning + flows.reduce((sum, f) => sum + f.amount * days(f.date, current.date) / duration, 0);
  return { gain, net, capital, rate: capital > 0 ? gain / capital : null };
}

export function periodGain(previous, current) {
  if (!previous || !current) return null;
  // This is investment gain translated at closing FX, not total portfolio return.
  const results = current.positions.map(p => ({ p, result: performance(previous, current, p.asset.id) })).filter(x => x.result);
  return results.length ? results.reduce((sum, { p, result }) => sum + result.gain * current.rates[p.asset.currency], 0) : null;
}

// Merge only the edited assets. Untouched amounts keep their actual valuation date.
export function buildPartialSnapshot(data, { date, id = uid(), updates = [], rates = {} }) {
  const existing = data.snapshots.find(s => s.date === date);
  const previous = ordered(data).filter(s => s.date < date).at(-1);
  const base = existing || previous;
  const assets = new Map(data.assets.map(asset => [asset.id, asset]));
  const positions = (base?.positions || []).map(p => existing ? structuredClone(p) : {
    ...structuredClone(p), asset: { ...assets.get(p.asset.id) }, flows: [], income: 0, baseline: false, valuedAt: p.valuedAt || base.date
  });
  for (const update of updates) {
    const asset = data.assets.find(a => a.id === update.id);
    if (!asset) throw new Error('找不到需要更新的资产');
    const index = positions.findIndex(p => p.asset.id === asset.id);
    const old = positions[index];
    const value = update.value ?? old?.value;
    if (value === undefined) throw new Error(`请填写「${asset.name}」的本次金额，其他资产可以留空`);
    const flows = update.flows || [];
    const income = update.income || 0;
    const position = {
      asset: { ...asset }, value, flows: structuredClone(flows), income, valuedAt: date,
      baseline: !previous?.positions.some(p => p.asset.id === asset.id) && !flows.length && !income
    };
    if (index < 0) positions.push(position); else positions[index] = position;
  }
  if (!positions.length) throw new Error('请至少填写一项资产的金额，其他资产可以留空');
  const snapshot = { id: existing?.id || id, date, rates: { CNY: 1, ...(base?.rates || {}), ...rates }, positions };
  validateData({ ...data, snapshots: [...data.snapshots.filter(s => s.date !== date), snapshot] });
  return snapshot;
}

export function deleteAsset(data, id) {
  return {
    ...data,
    assets: data.assets.filter(asset => asset.id !== id),
    snapshots: data.snapshots.map(snapshot => ({
      ...snapshot,
      positions: snapshot.positions.filter(position => position.asset.id !== id)
    }))
  };
}

function dateValid(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function amount(value, signed = false) { return Number.isFinite(value) && Math.abs(value) <= 1e14 && (signed || value >= 0); }
function validateAsset(asset) {
  assert(asset && typeof asset === 'object', '资产格式无效');
  for (const key of ['id', 'name', 'account', 'category']) assert(typeof asset[key] === 'string' && asset[key].trim().length > 0 && asset[key].length <= 120, '资产名称、账户或分类格式无效');
  assert(['domestic', 'overseas'].includes(asset.region) && ['savings', 'investment'].includes(asset.kind), '资产地区或类型无效');
  assert(CURRENCIES.includes(asset.currency), '不支持的币种');
}
export function validateData(input) {
  assert(input && input.version === SCHEMA_VERSION, '备份版本不支持，请选择本软件导出的 JSON 备份');
  assert(Array.isArray(input.assets) && Array.isArray(input.snapshots), '备份缺少资产或记录');
  assert(input.assets.length <= 2000 && input.snapshots.length <= 10000, '备份数据量超过本地版限制');
  const ids = new Set();
  for (const asset of input.assets) { validateAsset(asset); assert(!ids.has(asset.id), '资产编号重复'); ids.add(asset.id); }
  const dates = new Set(), snapshotIds = new Set();
  for (const snapshot of input.snapshots) {
    assert(snapshot && typeof snapshot.id === 'string' && snapshot.id.length > 0 && snapshot.id.length <= 120 && dateValid(snapshot.date) && snapshot.date <= today(), '记录编号或日期无效，日期不能晚于今天');
    assert(!snapshotIds.has(snapshot.id), '快照编号重复'); snapshotIds.add(snapshot.id);
    assert(!dates.has(snapshot.date), '同一天有重复记录'); dates.add(snapshot.date);
    assert(snapshot.rates && typeof snapshot.rates === 'object' && snapshot.rates.CNY === 1, '人民币汇率必须为 1');
    assert(Array.isArray(snapshot.positions) && snapshot.positions.length <= 2000, '资产记录格式无效');
    const seen = new Set();
    for (const p of snapshot.positions) {
      validateAsset(p.asset);
      assert(ids.has(p.asset.id) && !seen.has(p.asset.id), '记录包含未知或重复资产'); seen.add(p.asset.id);
      const master = input.assets.find(a => a.id === p.asset.id);
      assert(master.currency === p.asset.currency, '同一资产不能更换币种');
      assert(amount(p.value) && amount(p.income || 0), '资产金额无效');
      if (p.valuedAt !== undefined) assert(dateValid(p.valuedAt) && p.valuedAt <= snapshot.date, '资产金额更新日期无效');
      if (p.baseline !== undefined) assert(typeof p.baseline === 'boolean', '资产基准标记无效');
      assert(Number.isFinite(snapshot.rates[p.asset.currency]) && snapshot.rates[p.asset.currency] > 0 && snapshot.rates[p.asset.currency] <= 1e6, '汇率必须为正数');
      assert(Array.isArray(p.flows) && p.flows.length <= 1000, '资金进出格式无效');
      for (const f of p.flows) assert(f && amount(f.amount, true) && dateValid(f.date) && f.date <= snapshot.date, '资金进出的日期或金额无效');
    }
  }
  const sorted = ordered(input);
  sorted.forEach((s, i) => {
    for (const p of s.positions) {
      if (i === 0) assert(p.flows.length === 0 && !p.income, '首次记录是基准，不应包含期间资金进出或派息');
      else {
        const old = sorted[i - 1].positions.find(old => old.asset.id === p.asset.id);
        for (const f of p.flows) assert(f.date > (old?.valuedAt || sorted[i - 1].date), '资金进出日期必须晚于该资产上次金额更新且不晚于本次记录');
        if (p.baseline) assert(!old && !p.flows.length && !p.income, '仅首次录入的资产可以建立金额基准');
        if (!sorted[i - 1].positions.some(old => old.asset.id === p.asset.id) && p.value > 0) {
          assert(p.flows.length > 0 || p.baseline, `新增资产「${p.asset.name}」请填写期间投入，或建立首次金额基准。`);
        }
      }
    }
    if (i > 0) for (const old of sorted[i - 1].positions) assert(s.positions.some(p => p.asset.id === old.asset.id), '历史资产必须保留；清仓请将金额记为 0 并填写取出资金');
  });
  return structuredClone(input);
}

export function demoData() {
  const d = today();
  const prev = new Date(`${d}T12:00:00`); prev.setDate(prev.getDate() - 28);
  const startDate = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  const assets = [
    { id: 'demo-bank', name: '日常备用金', account: '招商银行', category: '活期存款', region: 'domestic', kind: 'savings', currency: 'CNY' },
    { id: 'demo-gold', name: '我的黄金', account: '黄金账户', category: '黄金', region: 'domestic', kind: 'investment', currency: 'CNY' },
    { id: 'demo-fund', name: '长期指数基金', account: '基金平台', category: '基金', region: 'domestic', kind: 'investment', currency: 'CNY' },
    { id: 'demo-usd', name: '美元储蓄', account: '海外银行', category: '定期存款', region: 'overseas', kind: 'savings', currency: 'USD' },
    { id: 'demo-etf', name: '全球 ETF', account: '海外证券', category: 'ETF', region: 'overseas', kind: 'investment', currency: 'USD' },
    { id: 'demo-wechat', name: '微信零钱', account: '微信', category: '活期存款', region: 'domestic', kind: 'savings', currency: 'CNY' },
    { id: 'demo-alipay', name: '支付宝备用金', account: '支付宝', category: '活期存款', region: 'domestic', kind: 'savings', currency: 'CNY' }
  ];
  const values = [[25000, 18000, 40000, 5000, 8000, 2000, 5000], [25012, 18960, 43200, 5012, 8240, 2000, 5014]];
  return { version: 1, assets, snapshots: [startDate, d].map((date, i) => ({ id: uid(), date, rates: { CNY: 1, USD: i ? 7.1 : 7.12 }, positions: assets.map((asset, j) => ({ asset: { ...asset }, value: values[i][j], flows: i && j === 2 ? [{ date, amount: 2000 }] : [], income: 0 })) })) };
}
