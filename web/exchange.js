import { CURRENCIES } from './domain.js';

export function exchangeRequest(currencies, date) {
  const codes = [...new Set(currencies)];
  if (!codes.length || codes.some(c => c === 'CNY' || !CURRENCIES.includes(c))) throw new Error('请选择支持的外币');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('记录日期无效');
  return new URLSearchParams({ base: 'CNY', quotes: codes.join(','), date });
}

export function normalizeExchange(rows, currencies, date) {
  exchangeRequest(currencies, date);
  if (!Array.isArray(rows)) throw new Error('汇率服务返回格式异常');
  const rates = {}, dates = {};
  for (const currency of currencies) {
    const matches = rows.filter(r => r.base === 'CNY' && r.quote === currency);
    const row = matches[0];
    if (matches.length !== 1 || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date > date || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date) throw new Error(currency + ' 汇率缺失或无效');
    const value = 1 / row.rate;
    // Small unit rates (e.g. JPY) need extra decimals to avoid a large rounding error.
    const rounded = Number(value.toFixed(value < 1 ? 4 : 2));
    if (rounded <= 0 || rounded > 1000000) throw new Error(currency + ' 汇率超出范围');
    rates[currency] = rounded;
    dates[currency] = row.date;
  }
  return { rates, dates, provider: 'Frankfurter' };
}

export async function fetchExchange(currencies, date, fetcher = fetch) {
  const params = exchangeRequest(currencies, date);
  const response = await fetcher('https://api.frankfurter.dev/v2/rates?' + params, { signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) throw new Error('汇率服务暂不可用');
  return normalizeExchange(await response.json(), currencies, date);
}
