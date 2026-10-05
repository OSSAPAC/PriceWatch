// PriceWatch data layer.
// Pure functions only (no DOM, no network), so this file can be unit tested with Node.
//
// Data lives in three CSV files:
//   data/shops.csv   id,name,color
//   data/items.csv   id,name,only_at_shop_id,compare_by
//   data/prices.csv  date,shop_id,item_id,price,amount,unit,source
// See docs/DATA_FORMAT.md for details.

export const FILES = {
  shops: 'data/shops.csv',
  items: 'data/items.csv',
  prices: 'data/prices.csv',
};

export const HEADERS = {
  shops: ['id', 'name', 'color'],
  items: ['id', 'name', 'only_at_shop_id', 'compare_by'],
  prices: ['date', 'shop_id', 'item_id', 'price', 'amount', 'unit', 'source'],
};

export const SOURCES = ['bill', 'shelf'];

// Units a price can be for, and how each converts to the unit items are compared by.
export const UNITS = {
  g: { by: 'kg', factor: 0.001 },
  kg: { by: 'kg', factor: 1 },
  ml: { by: 'L', factor: 0.001 },
  L: { by: 'L', factor: 1 },
  each: { by: 'each', factor: 1 },
};
export const COMPARE_BY = ['kg', 'L', 'each'];
export const cleanUnit = u => {
  const s = String(u ?? '').trim();
  if (s === 'l' || s === 'litre' || s === 'liter') return 'L';
  return UNITS[s] ? s : UNITS[s.toLowerCase()] ? s.toLowerCase() : 'each';
};
const cleanAmount = a => { const n = Number(a); return n > 0 ? n : 1; };
const amountStr = n => String(Math.round(Number(n) * 1000) / 1000);

// Price per kg, per litre or per item for one price row, or null if its unit can't be
// converted to how the item is compared (e.g. "each" for an item compared per kg).
export function unitPrice(row, item) {
  const u = UNITS[row.unit || 'each'];
  const by = item?.compareBy || 'each';
  if (!u || u.by !== by) return null;
  return row.price / ((row.amount || 1) * u.factor);
}
export const compareByFor = unit => UNITS[cleanUnit(unit)].by;

export const PALETTE = ['#2D7A4D', '#C2571A', '#3B5BA9', '#8A3FA0', '#B08710', '#1F8A8A', '#B23A48', '#5A6B2E', '#6B5B95', '#D06A9A'];

/* ---------------- small helpers ---------------- */

export const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const round2 = n => Math.round(Number(n) * 100) / 100;
export const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
export const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / 864e5);
export const todayStr = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function slugify(name) {
  const s = norm(name).replace(/ /g, '-').slice(0, 40).replace(/-+$/, '');
  return s || 'x';
}
export function uniqueId(base, taken) {
  let id = slugify(base), n = 2;
  while (taken.has(id)) id = `${slugify(base)}-${n++}`;
  return id;
}

/* ---------------- CSV ---------------- */

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

const csvField = v => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (header, rows) => [header, ...rows].map(r => r.map(csvField).join(',')).join('\n') + '\n';

// Turns CSV text into objects keyed by header name, so column order doesn't matter.
function records(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const emptyData = () => ({ shops: [], items: [], prices: [] });

export function parseData(texts) {
  const shops = records(texts.shops).filter(r => r.id && r.name)
    .map((r, i) => ({ id: r.id, name: r.name, color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : PALETTE[i % PALETTE.length] }));
  const items = records(texts.items).filter(r => r.id && r.name)
    .map(r => ({ id: r.id, name: r.name, onlyAt: r.only_at_shop_id || null, compareBy: COMPARE_BY.includes(r.compare_by) ? r.compare_by : (r.compare_by?.toLowerCase() === 'l' ? 'L' : 'each') }));
  // Files from before amounts existed have no amount/unit columns: those prices are for one item.
  const prices = records(texts.prices)
    .map(r => ({ date: r.date, shopId: r.shop_id, itemId: r.item_id, price: Number(r.price), amount: cleanAmount(r.amount), unit: cleanUnit(r.unit), source: SOURCES.includes(r.source) ? r.source : 'shelf' }))
    .filter(p => isDate(p.date) && p.shopId && p.itemId && p.price > 0);
  return { shops, items, prices };
}

export function serialize(data) {
  const prices = [...data.prices].sort((a, b) =>
    a.date.localeCompare(b.date) || a.shopId.localeCompare(b.shopId) || a.itemId.localeCompare(b.itemId));
  return {
    shops: toCSV(HEADERS.shops, data.shops.map(s => [s.id, s.name, s.color])),
    items: toCSV(HEADERS.items, [...data.items].sort((a, b) => a.id.localeCompare(b.id)).map(i => [i.id, i.name, i.onlyAt || '', i.compareBy || 'each'])),
    prices: toCSV(HEADERS.prices, prices.map(p => [p.date, p.shopId, p.itemId, round2(p.price).toFixed(2), amountStr(p.amount || 1), p.unit || 'each', p.source])),
  };
}

/* ---------------- changes ----------------
 * Every change is a small "op". The app sends a list of ops; storage re-reads the newest
 * files, applies the ops, and writes them back. That way two people saving at the same
 * time don't overwrite each other.
 */

export function applyOps(data, ops) {
  const d = structuredClone(data);
  const shopMap = new Map(), itemMap = new Map();
  const sid = id => shopMap.get(id) || id;
  const iid = id => itemMap.get(id) || id;
  const shop = id => d.shops.find(s => s.id === sid(id));
  const item = id => d.items.find(i => i.id === iid(id));

  for (const op of ops) {
    switch (op.op) {
      case 'addShop': {
        const same = d.shops.find(s => norm(s.name) === norm(op.shop.name));
        if (same) { shopMap.set(op.shop.id, same.id); break; }
        const taken = new Set(d.shops.map(s => s.id));
        const id = taken.has(op.shop.id) ? uniqueId(op.shop.name, taken) : op.shop.id;
        if (id !== op.shop.id) shopMap.set(op.shop.id, id);
        d.shops.push({ id, name: op.shop.name.trim(), color: op.shop.color || PALETTE[d.shops.length % PALETTE.length] });
        break;
      }
      case 'updateShop': {
        const s = shop(op.id); if (!s) throw new Error('That shop no longer exists. Refresh and try again.');
        if (op.name) s.name = op.name.trim();
        if (op.color) s.color = op.color;
        break;
      }
      case 'deleteShop': {
        const id = sid(op.id);
        if (d.prices.some(p => p.shopId === id)) throw new Error('This shop still has prices. Delete them in History first.');
        d.shops = d.shops.filter(s => s.id !== id);
        d.items.forEach(i => { if (i.onlyAt === id) i.onlyAt = null; });
        break;
      }
      case 'addItem': {
        const onlyAt = op.item.onlyAt ? sid(op.item.onlyAt) : null;
        const same = d.items.find(i => norm(i.name) === norm(op.item.name) && (i.onlyAt || null) === onlyAt);
        if (same) { itemMap.set(op.item.id, same.id); break; }
        const taken = new Set(d.items.map(i => i.id));
        const id = taken.has(op.item.id) ? uniqueId(op.item.name, taken) : op.item.id;
        if (id !== op.item.id) itemMap.set(op.item.id, id);
        d.items.push({ id, name: op.item.name.trim(), onlyAt, compareBy: COMPARE_BY.includes(op.item.compareBy) ? op.item.compareBy : 'each' });
        break;
      }
      case 'updateItem': {
        const i = item(op.id); if (!i) throw new Error('That item no longer exists. Refresh and try again.');
        if (op.name) i.name = op.name.trim();
        if ('onlyAt' in op) i.onlyAt = op.onlyAt ? sid(op.onlyAt) : null;
        if (COMPARE_BY.includes(op.compareBy)) i.compareBy = op.compareBy;
        break;
      }
      case 'mergeItems': {
        const from = iid(op.from), into = iid(op.into);
        if (!item(into)) throw new Error('The item to keep no longer exists. Refresh and try again.');
        d.prices.forEach(p => { if (p.itemId === from) p.itemId = into; });
        d.items = d.items.filter(i => i.id !== from);
        break;
      }
      case 'deleteItem': {
        const id = iid(op.id);
        d.items = d.items.filter(i => i.id !== id);
        d.prices = d.prices.filter(p => p.itemId !== id);
        break;
      }
      case 'addPrices': {
        for (const r of op.rows) {
          const row = { date: r.date, shopId: sid(r.shopId), itemId: iid(r.itemId), price: round2(r.price), amount: cleanAmount(r.amount), unit: cleanUnit(r.unit), source: SOURCES.includes(r.source) ? r.source : 'shelf' };
          if (!isDate(row.date) || !(row.price > 0)) throw new Error('A price row has a bad date or price.');
          if (!shop(row.shopId)) throw new Error('A shop was removed while you were editing. Refresh and try again.');
          if (!item(row.itemId)) throw new Error('An item was removed while you were editing. Refresh and try again.');
          d.prices.push(row);
        }
        break;
      }
      case 'deleteVisit': {
        const s = sid(op.shopId);
        d.prices = d.prices.filter(p => !(p.date === op.date && p.shopId === s && p.source === op.source));
        break;
      }
      default: throw new Error('Unknown change: ' + op.op);
    }
  }
  return d;
}

/* ---------------- analysis ---------------- */

const lastOf = a => (a && a.length ? a[a.length - 1] : null);
export { lastOf };

// itemId -> shopId -> [{date, price, paid, amount, unit, source}] sorted by date.
// `price` is the comparable price: per kg, per litre or per item, depending on the item's compare_by.
// Ignored (and reported by conflicts() / unitMismatches()):
//   - prices for an "only at" item recorded at a different shop
//   - prices whose unit doesn't fit how the item is compared (e.g. "each" for a per-kg item)
export function buildIndex(data) {
  const shops = new Set(data.shops.map(s => s.id));
  const items = new Map(data.items.map(i => [i.id, i]));
  const idx = new Map();
  data.prices.forEach((p, order) => {
    const it = items.get(p.itemId);
    if (!it || !shops.has(p.shopId)) return;
    if (it.onlyAt && it.onlyAt !== p.shopId) return;
    const up = unitPrice(p, it);
    if (up == null) return;
    let m = idx.get(p.itemId); if (!m) idx.set(p.itemId, m = new Map());
    let a = m.get(p.shopId); if (!a) m.set(p.shopId, a = []);
    a.push({ date: p.date, price: up, paid: p.price, amount: p.amount, unit: p.unit, source: p.source, order });
  });
  for (const m of idx.values()) for (const a of m.values())
    a.sort((x, y) => x.date.localeCompare(y.date) || x.order - y.order);
  return idx;
}

export function conflicts(data, itemId) {
  const it = data.items.find(i => i.id === itemId);
  if (!it?.onlyAt) return [];
  return data.prices.filter(p => p.itemId === itemId && p.shopId !== it.onlyAt);
}

export function unitMismatches(data, itemId) {
  const it = data.items.find(i => i.id === itemId);
  if (!it) return [];
  return data.prices.filter(p => p.itemId === itemId && unitPrice(p, it) == null);
}

// Price expected `ahead` days from today, from a straight-line trend.
// Needs 3+ prices over 3+ weeks; otherwise the latest price. Capped at ±25% of the latest.
export function project(a, ahead = 30, today = todayStr()) {
  const l = lastOf(a);
  if (a.length < 3) return l.price;
  const xs = a.map(o => dayNum(o.date)), ys = a.map(o => o.price);
  if (xs[xs.length - 1] - xs[0] < 21) return l.price;
  const mx = avg(xs), my = avg(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (!den) return l.price;
  const b = num / den, a0 = my - b * mx;
  const p = a0 + b * (dayNum(today) + ahead);
  return Math.min(l.price * 1.25, Math.max(l.price * 0.75, p));
}

// For items priced at 2+ shops: how far each shop sits above the cheapest, on average.
export function ranking(data, idx = buildIndex(data)) {
  const per = new Map(data.shops.map(s => [s.id, { shop: s, ratios: [], wins: 0 }]));
  const onlyAt = new Map(data.items.map(i => [i.id, i.onlyAt]));
  let shared = 0;
  for (const [itemId, m] of idx) {
    if (onlyAt.get(itemId)) continue;
    const prices = [...m].filter(([s]) => per.has(s)).map(([s, a]) => [s, lastOf(a).price]);
    if (prices.length < 2) continue;
    shared++;
    const min = Math.min(...prices.map(p => p[1]));
    for (const [s, p] of prices) { const r = per.get(s); r.ratios.push(p / min); if (p === min) r.wins++; }
  }
  const rows = [...per.values()].map(r => ({ ...r, n: r.ratios.length, avg: r.ratios.length ? (avg(r.ratios) - 1) * 100 : null }));
  rows.sort((a, b) => ((a.avg == null) - (b.avg == null)) || ((a.avg ?? 0) - (b.avg ?? 0)) || (b.n - a.n));
  return { rows, shared };
}

export function gaps(data, idx = buildIndex(data), limit = 8) {
  const out = [];
  for (const [itemId, m] of idx) {
    const it = data.items.find(i => i.id === itemId);
    if (!it || it.onlyAt) continue;
    const ps = [...m].map(([sid, a]) => ({ sid, p: lastOf(a).price, date: lastOf(a).date }));
    if (ps.length < 2) continue;
    ps.sort((a, b) => a.p - b.p);
    const lo = ps[0], hi = ps[ps.length - 1];
    if (hi.p === lo.p) continue;
    out.push({ it, lo, hi, pct: (hi.p - lo.p) / lo.p * 100 });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, limit);
}

// Typical (median) price change per shop, for items seen 2+ times at least 14 days apart.
export function movement(data, idx = buildIndex(data)) {
  const per = new Map();
  for (const m of idx.values()) for (const [sid, a] of m) {
    if (a.length < 2) continue;
    const f = a[0], l = lastOf(a);
    if (dayNum(l.date) - dayNum(f.date) < 14) continue;
    const e = per.get(sid) || { ch: [], since: f.date };
    e.ch.push((l.price - f.price) / f.price * 100);
    if (f.date < e.since) e.since = f.date;
    per.set(sid, e);
  }
  return [...per].map(([sid, e]) => ({ sid, med: median(e.ch), n: e.ch.length, since: e.since }));
}

// basket: { itemId: amount per month, in the item's compare_by unit (kg, L or items) }
export function forecast(data, basket, idx = buildIndex(data), today = todayStr()) {
  const items = new Map(data.items.map(i => [i.id, i]));
  const per = Object.entries(basket || {}).filter(([id, q]) => items.has(id) && Number(q) > 0).map(([id, q]) => {
    const m = idx.get(id) || new Map();
    const offers = [...m].map(([sid, a]) => ({ sid, now: lastOf(a).price, next: project(a, 30, today), date: lastOf(a).date }))
      .sort((x, y) => x.now - y.now);
    return { it: items.get(id), qty: Number(q), offers };
  });
  const priced = per.filter(p => p.offers.length);
  const shops = data.shops.map(s => {
    let here = 0, hereNext = 0, covered = 0, rest = 0, restNext = 0;
    for (const p of priced) {
      const o = p.offers.find(o => o.sid === s.id);
      if (o) { here += o.now * p.qty; hereNext += o.next * p.qty; covered++; }
      else { rest += p.offers[0].now * p.qty; restNext += Math.min(...p.offers.map(o => o.next)) * p.qty; }
    }
    return { s, here, covered, rest, total: here + rest, totalNext: hereNext + restNext };
  }).filter(r => r.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.total - b.total);
  let mix = 0, mixNext = 0; const mixShops = new Set();
  for (const p of priced) { mix += p.offers[0].now * p.qty; mixNext += Math.min(...p.offers.map(o => o.next)) * p.qty; mixShops.add(p.offers[0].sid); }
  const onlyOne = new Map();
  for (const p of priced) if (p.offers.length === 1) {
    const sid = p.offers[0].sid; if (!onlyOne.has(sid)) onlyOne.set(sid, []); onlyOne.get(sid).push(p);
  }
  return { per, priced, unpriced: per.filter(p => !p.offers.length), shops, mix, mixNext, mixShops, onlyOne };
}

// Items with a bill price in the last `days` days — a starting point for the basket.
export function recentlyBought(data, days = 90, today = todayStr()) {
  const cutoff = dayNum(today) - days;
  return [...new Set(data.prices.filter(p => p.source === 'bill' && dayNum(p.date) >= cutoff).map(p => p.itemId))]
    .filter(id => data.items.some(i => i.id === id));
}

// Prices grouped into visits: one shop, one date, one source.
export function visits(data) {
  const g = new Map();
  for (const p of data.prices) {
    const k = `${p.date}|${p.shopId}|${p.source}`;
    if (!g.has(k)) g.set(k, { date: p.date, shopId: p.shopId, source: p.source, rows: [] });
    g.get(k).rows.push(p);
  }
  return [...g.values()].sort((a, b) => b.date.localeCompare(a.date));
}
