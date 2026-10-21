import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeRequest, normalizeExchange, fetchExchange } from '../web/exchange.js';
import { buildPartialSnapshot, demoData } from '../web/domain.js';

const rows = [
  { base: 'CNY', quote: 'USD', date: '2026-10-20', rate: .14981 },
  { base: 'CNY', quote: 'JPY', date: '2026-10-19', rate: 23.711 }
];
test('batch FX inverts CNY quotes, rounds normal currencies to cents, and preserves small rates', () => {
  const result = normalizeExchange(rows, ['USD', 'JPY'], '2026-10-21');
  assert.deepEqual(result.rates, { USD: 6.68, JPY: .0422 });
  assert.deepEqual(result.dates, { USD: '2026-10-20', JPY: '2026-10-19' });
});
test('FX fails atomically for missing, invalid, duplicate or future observations', () => {
  for (const invalid of [[], null, [...rows, rows[0]], [{ ...rows[0], rate: 0 }], [{ ...rows[0], rate: '2' }], [{ ...rows[0], rate: Infinity }], [{ ...rows[0], date: '2026-10-22' }], [{ ...rows[0], date: '2026-02-30' }]]) {
    assert.throws(() => normalizeExchange(invalid, ['USD'], '2026-10-21'));
  }
});
test('request restricts codes and dates and sends only public currency/date parameters', () => {
  assert.equal(exchangeRequest(['USD', 'USD'], '2026-10-21').toString(), 'base=CNY&quotes=USD&date=2026-10-21');
  for (const codes of [[], ['BTC'], ['CNY'], ['https://example.com']]) assert.throws(() => exchangeRequest(codes, '2026-10-21'));
  for (const date of ['', '2026-02-30', 'abc']) assert.throws(() => exchangeRequest(['USD'], date));
});
test('fetch uses fixed provider, timeout, and selected historical date', async () => {
  let called = false;
  await fetchExchange(['USD'], '2026-10-21', async (url, options) => {
    called = true;
    assert.equal(new URL(url).hostname, 'api.frankfurter.dev');
    assert.equal(new URL(url).searchParams.get('date'), '2026-10-21');
    assert.ok(options.signal); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => [rows[0]] };
  });
  assert.ok(called);
  await assert.rejects(fetchExchange(['USD'], '2026-10-21', async () => ({ ok: false })));
  await assert.rejects(fetchExchange(['USD'], '2026-10-21', async () => { throw new Error('offline'); }));
});
test('saving only fetched FX preserves amounts, actual valuation dates, and historical snapshots', () => {
  const data = demoData(), before = structuredClone(data);
  const date = data.snapshots.at(-1).date;
  const result = buildPartialSnapshot(data, { date, rates: { USD: 6.68 } });
  assert.equal(result.rates.USD, 6.68);
  assert.deepEqual(result.positions, data.snapshots.at(-1).positions);
  assert.deepEqual(data, before);
});
