// PriceWatch user interface.
import {
  PALETTE, norm, isDate, dayNum, todayStr, uniqueId, lastOf, serialize,
  buildIndex, ranking, gaps, movement, forecast, recentlyBought, visits, conflicts,
  UNITS, unitPrice, compareByFor, unitMismatches, cleanUnit,
} from './data.js';
import { GitHubStore, ReadOnlyStore, LocalStore, detectRepo } from './store.js';
import { readPrices, prepareImage, DEFAULT_MODEL } from './reader.js';

/* ---------------- settings & local preferences ---------------- */
const SETTINGS_KEY = 'pricewatch:settings';
const BASKET_KEY = 'pricewatch:basket';
const readJSON = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
// Move settings saved before the app was renamed from Trolley Watch.
for (const k of ['settings', 'basket', 'local-data']) {
  try {
    const old = localStorage.getItem('trolley-watch:' + k);
    if (old != null && localStorage.getItem('pricewatch:' + k) == null) localStorage.setItem('pricewatch:' + k, old);
    if (old != null) localStorage.removeItem('trolley-watch:' + k);
  } catch { /* storage off */ }
}
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };
let settings = { mode: 'github', owner: '', repo: '', branch: 'main', token: '', aiKey: '', aiModel: DEFAULT_MODEL, currency: '$', ...readJSON(SETTINGS_KEY, {}) };
let basket = readJSON(BASKET_KEY, {});
const saveSettings = () => writeJSON(SETTINGS_KEY, settings);
const saveBasket = () => writeJSON(BASKET_KEY, basket);

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const fmtShort = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
const fmtMonth = d => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = n => (n == null || Number.isNaN(n)) ? '—' : settings.currency + Number(n).toFixed(2);
const pctStr = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SOURCE_LABEL = { bill: 'Bill', shelf: 'Shelf or price list' };
const PER = { kg: '/kg', L: '/L', each: ' each' };
const BY_LABEL = { kg: 'per kg', L: 'per litre', each: 'per item' };
const BY_UNIT = { kg: 'kg', L: 'L', each: 'items' };
// A comparable price with its unit, e.g. "$4.20/kg", "$1.55/L", "$3.10 each".
const uprice = (n, by = 'each') => money(n) + PER[by];
const fmtAmount = (amount, unit) => unit === 'each' ? (Number(amount) === 1 ? '1 item' : `${amount} items`) : `${amount} ${unit}`;
const UNIT_OPTIONS = Object.keys(UNITS);

/* ---------------- app state ---------------- */
let D = { shops: [], items: [], prices: [] };
let store = null;
let loading = false, loadError = '', saving = false, loadedAt = 0;
let tab = 'compare';

const shopById = id => D.shops.find(s => s.id === id);
const itemById = id => D.items.find(i => i.id === id);
const shopName = id => shopById(id)?.name || 'Unknown shop';
const shopColor = id => shopById(id)?.color || '#888';
const dot = id => `<span class="dot" style="background:${esc(shopColor(id))}"></span>`;
const canWrite = () => !!store?.canWrite && !saving;

function makeStore() {
  if (settings.mode === 'local') return new LocalStore();
  const det = detectRepo();
  const owner = (settings.owner || det?.owner || '').trim();
  const repo = (settings.repo || det?.repo || '').trim();
  const branch = (settings.branch || 'main').trim();
  if (!owner || !repo) return null;
  if (settings.token) return new GitHubStore({ owner, repo, branch, token: settings.token.trim() });
  if (det && det.owner.toLowerCase() === owner.toLowerCase() && det.repo.toLowerCase() === repo.toLowerCase()) return new ReadOnlyStore(`${owner}/${repo}`);
  return new GitHubStore({ owner, repo, branch, token: null });
}

async function load() {
  store = makeStore();
  loadError = '';
  if (!store) { D = { shops: [], items: [], prices: [] }; render(); return; }
  loading = true; render();
  try { D = await store.load(); loadedAt = Date.now(); }
  catch (e) { loadError = e.message || 'Couldn’t load your data.'; }
  finally { loading = false; render(); }
}

async function save(ops, message, okMsg) {
  if (!store?.canWrite) { toast('This view is read-only. Add a GitHub token in Settings to make changes.'); return false; }
  saving = true; renderHeader();
  try {
    D = await store.save(ops, message);
    loadedAt = Date.now();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(e.message || 'Couldn’t save.');
    return false;
  } finally {
    saving = false; renderHeader();
  }
}

/* ---------------- toast / dialog ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}
function openDlg(html) { $('#dlgBody').innerHTML = html; const d = $('#dlg'); if (!d.open) d.showModal(); d.scrollTop = 0; }
function closeDlg() { const d = $('#dlg'); if (d.open) d.close(); }
function armConfirm(btn, label, fn) {
  if (btn.classList.contains('armed')) { fn(); return; }
  const old = btn.textContent; btn.classList.add('armed'); btn.textContent = label;
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = old; } }, 4000);
}

/* ---------------- header ---------------- */
function renderHeader() {
  const el = $('#conn');
  if (!store) { el.innerHTML = 'Not connected'; }
  else {
    const where = store instanceof LocalStore ? 'Saved in this browser only'
      : store.canWrite ? `Saved to ${esc(store.label)}` : `Viewing ${esc(store.label)} (read-only)`;
    el.innerHTML = `${saving ? '<span class="spin" aria-hidden="true"></span> Saving…' : where}
      <button class="btn quiet small-btn" id="refresh" ${loading || saving ? 'disabled' : ''}>Refresh</button>`;
  }
  const b = $('#banner');
  if (!store) b.textContent = 'Connect a GitHub repository in Settings to load and save your prices.';
  else if (loadError) b.textContent = loadError;
  else if (store instanceof LocalStore) b.textContent = 'You’re trying the app in this browser only. Switch to a GitHub repository in Settings to keep and share your data.';
  else if (!store.canWrite) b.textContent = 'You can look but not change anything. To add prices, paste a GitHub token in Settings.';
  else b.textContent = '';
}

/* ---------------- render ---------------- */
function setTab(t) {
  tab = t;
  $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  render();
  window.scrollTo?.({ top: 0 });
}
function render() {
  renderHeader();
  const v = $('#view');
  if (loading) { v.innerHTML = '<div class="status"><span class="spin"></span>Loading prices…</div>'; return; }
  ({ compare: renderCompare, add: renderAdd, prices: renderPrices, history: renderHistory, forecast: renderForecast, shops: renderShops, settings: renderSettings })[tab](v);
}

function emptyState() {
  const needSetup = !store;
  return `<section class="panel empty stack">
    <h2>Find out which shop is really cheaper</h2>
    <p class="lede">Every bill and every shelf price you add becomes a dated price at a shop. After a few visits you’ll see which shop wins, how prices move, and what your usual shopping would cost elsewhere.</p>
    <ol>
      <li>Connect your GitHub repository, where your prices are kept.</li>
      <li>Add the shops you visit${D.shops.length ? ` (you have ${D.shops.length})` : ''}.</li>
      <li>Snap a bill when you buy, or the shelf tags when you just look, and check the prices it reads.</li>
    </ol>
    <div class="actions"><button class="btn primary" data-go="${needSetup ? 'settings' : D.shops.length ? 'add' : 'shops'}">${needSetup ? 'Open Settings' : D.shops.length ? 'Add your first prices' : 'Add your shops'}</button></div>
  </section>`;
}

/* ---------------- line chart (SVG) ---------------- */
function lineChart(series, by = 'each') {
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return '<p class="muted">No prices yet.</p>';
  const W = 640, H = 260, L = 72, R = 16, T = 14, B = 34;
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  if (x0 === x1) { x0 -= 7; x1 += 7; }
  let y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  const pad = (y1 - y0) * 0.15 || y1 * 0.1 || 1; y0 = Math.max(0, y0 - pad); y1 += pad;
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R);
  const sy = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const xd = d => new Date(d * 864e5).toISOString().slice(0, 10);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const val = y0 + (y1 - y0) * i / 4, y = sy(val);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${esc(money(val) + (by === 'each' ? '' : PER[by]))}</text>`;
  }
  for (const t of [x0, Math.round((x0 + x1) / 2), x1]) g += `<text x="${sx(t)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(fmtShort(xd(t)))}</text>`;
  for (const s of series) {
    const ps = [...s.points].sort((a, b) => a.x - b.x);
    if (ps.length > 1) g += `<polyline fill="none" stroke="${esc(s.color)}" stroke-width="2.5" stroke-linejoin="round" points="${ps.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')}"/>`;
    for (const p of ps) g += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="${esc(s.color)}" stroke="var(--surface)" stroke-width="1.5"><title>${esc(s.name)}: ${esc(uprice(p.y, by))} on ${esc(fmtDate(xd(p.x)))}</title></circle>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price over time">${g}</svg>`;
}

/* ---------------- Compare ---------------- */
function renderCompare(v) {
  if (!D.prices.length) { v.innerHTML = emptyState(); return; }
  const idx = buildIndex(D);
  const { rows, shared } = ranking(D, idx);
  const ranked = rows.filter(r => r.avg != null);
  let summary;
  if (ranked.length >= 2) {
    const best = ranked[0], worst = ranked[ranked.length - 1];
    const gap = ((1 + worst.avg / 100) / (1 + best.avg / 100) - 1) * 100;
    summary = `<strong>${esc(best.shop.name)}</strong> is the cheapest so far. Across ${plural(shared, 'item')} you’ve priced at more than one shop, ${esc(worst.shop.name)} costs about <strong>${gap.toFixed(1)}% more</strong> on average.`;
  } else {
    summary = 'To rank shops, price the same item at two or more shops.';
  }
  const tags = rows.map((r, i) => {
    const best = i === 0 && r.avg != null && ranked.length >= 2;
    const fig = r.avg == null ? '—' : r.avg < 0.05 ? 'Lowest' : '+' + r.avg.toFixed(1) + '%';
    const note = r.avg == null ? 'No item here priced at another shop yet.'
      : r.avg < 0.05 ? `Cheapest on all ${plural(r.n, 'shared item')}.`
        : `Above the cheapest price, on average. Cheapest on ${r.wins} of ${r.n} shared items.`;
    return `<article class="ptag ${best ? 'best' : ''}" style="--shop:${esc(r.shop.color)}">
      ${best ? '<span class="rib">Best value</span>' : ''}
      <div class="shop">${esc(r.shop.name)}</div><div class="fig num">${fig}</div><div class="note">${note}</div></article>`;
  }).join('');

  const gp = gaps(D, idx);
  const gapHTML = gp.length ? `<div class="scroll"><table>
    <thead><tr><th>Item</th><th>Cheapest</th><th>Dearest</th><th class="r">Difference</th></tr></thead>
    <tbody>${gp.map(g => `<tr>
      <td><button class="link" data-item="${esc(g.it.id)}">${esc(g.it.name)}</button></td>
      <td>${dot(g.lo.sid)}${esc(shopName(g.lo.sid))} <span class="num">${uprice(g.lo.p, g.it.compareBy)}</span></td>
      <td>${dot(g.hi.sid)}${esc(shopName(g.hi.sid))} <span class="num">${uprice(g.hi.p, g.it.compareBy)}</span></td>
      <td class="r num up">${pctStr(g.pct)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Once an item is priced at two shops, the biggest differences show here.</p>';

  const mv = movement(D, idx).filter(m => shopById(m.sid));
  const mvHTML = mv.length ? `<div class="scroll"><table><thead><tr><th>Shop</th><th class="r">Typical change</th><th>Based on</th></tr></thead><tbody>
    ${mv.map(m => `<tr><td>${dot(m.sid)}${esc(shopName(m.sid))}</td><td class="r num ${m.med > 0.05 ? 'up' : m.med < -0.05 ? 'down' : ''}">${pctStr(m.med)}</td><td class="muted small">${plural(m.n, 'item')} since ${esc(fmtDate(m.since))}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Price trends appear when the same item is seen at the same shop at least two weeks apart.</p>';

  const ex = new Map();
  for (const it of D.items) if (it.onlyAt && shopById(it.onlyAt)) { if (!ex.has(it.onlyAt)) ex.set(it.onlyAt, []); ex.get(it.onlyAt).push(it); }
  const exHTML = ex.size ? [...ex].map(([sid, its]) => `<div class="exgroup"><div class="strong">${dot(sid)}${esc(shopName(sid))}</div>
    <div class="chips">${its.map(it => { const a = idx.get(it.id)?.get(sid); return `<button class="chip" data-item="${esc(it.id)}">${esc(it.name)}${a ? ` <span class="num muted">${uprice(lastOf(a).price, it.compareBy)}</span>` : ''}</button>`; }).join('')}</div></div>`).join('')
    : '<p class="muted">Items you mark as “only sold here” are kept out of comparisons and listed here.</p>';

  v.innerHTML = `<div class="stack">
    <section class="stack tight"><h2>Which shop is cheaper</h2><p class="summary">${summary}</p><div class="tags">${tags}</div>
      <p class="muted small">Uses the latest price you’ve seen for each item at each shop, per kg, per litre or per item, so different pack sizes compare fairly. Items sold at only one shop don’t count toward the ranking.</p></section>
    <section class="panel"><h3 class="section-h">Biggest price gaps</h3>${gapHTML}</section>
    <section class="grid2">
      <div class="panel"><h3 class="section-h">How prices are moving</h3>${mvHTML}</div>
      <div class="panel"><h3 class="section-h">Only at one shop</h3>${exHTML}</div>
    </section></div>`;
}

/* ---------------- Add prices ---------------- */
const freshDraft = () => ({
  photos: [], shopId: D.shops.length === 1 ? D.shops[0].id : '', date: todayStr(), source: 'bill',
  lines: null, editing: null, busy: false, ctl: null, note: '', addingShop: false,
});
let draft = freshDraft();
const blankLine = () => ({ name: '', itemId: '', price: '', amount: 1, unit: 'each', excl: false });
// How a review line will be compared: the matched item's setting, or what its unit suggests for a new item.
const lineBy = l => (l.itemId && itemById(l.itemId)?.compareBy) || compareByFor(l.unit);
function lineUnitPriceHTML(l) {
  const it = l.itemId ? itemById(l.itemId) : null;
  const price = Number(l.price), amount = Number(l.amount);
  if (!(price > 0) || !(amount > 0)) return '<span class="muted">—</span>';
  const by = lineBy(l);
  const up = unitPrice({ price, amount, unit: cleanUnit(l.unit) }, { compareBy: by });
  if (up == null) return `<span class="warn">Needs ${it.compareBy === 'kg' ? 'a weight' : it.compareBy === 'L' ? 'a volume' : 'a count'}</span>`;
  return `<span class="num">${uprice(up, by)}</span>`;
}
const allowedItems = shopId => D.items.filter(i => !i.onlyAt || i.onlyAt === shopId).sort((a, b) => a.name.localeCompare(b.name));
const matchItem = (name, shopId) => allowedItems(shopId).find(i => norm(i.name) === norm(name))?.id || '';

/* ---- product search in the review table ----
 * Typing in a Product field lists matching items you already track. Pick one to add this price to its
 * history, or pick "New item" to start a new one. An exact name match links automatically. */
let combo = null; // { i: line index, idx: highlighted option, opts: [{ id } | { newItem: true }] }

function suggestions(query, shopId) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  return allowedItems(shopId)
    .map(it => ({ it, n: norm(it.name) }))
    .filter(x => words.every(w => x.n.includes(w)))
    .sort((a, b) => (b.n.startsWith(q) - a.n.startsWith(q)) || a.it.name.localeCompare(b.it.name))
    .slice(0, 8)
    .map(x => x.it);
}

// Item name with the typed text in bold, e.g. **Full cr**eam Milk.
function highlight(name, query) {
  const q = String(query).trim().toLowerCase();
  const at = q ? name.toLowerCase().indexOf(q) : -1;
  if (at < 0) return esc(name);
  return esc(name.slice(0, at)) + '<b>' + esc(name.slice(at, at + q.length)) + '</b>' + esc(name.slice(at + q.length));
}

// Latest comparable price for an item, at this shop if seen here, otherwise anywhere.
function hintPrice(it, shopId, idx) {
  const m = idx.get(it.id);
  if (!m) return '';
  const here = m.get(shopId);
  if (here) return `${uprice(lastOf(here).price, it.compareBy)} here`;
  let best = null;
  for (const [sid, a] of m) { const l = lastOf(a); if (!best || l.date > best.l.date) best = { sid, l }; }
  return best ? `${uprice(best.l.price, it.compareBy)} at ${esc(shopName(best.sid))}` : '';
}

function comboHTML(i) {
  if (!combo || combo.i !== i) return '';
  const l = draft.lines[i];
  const idx = buildIndex(D);
  const items = suggestions(l.name, draft.shopId);
  const exact = items.some(it => norm(it.name) === norm(l.name));
  combo.opts = [...items.map(it => ({ id: it.id })), ...(!exact && l.name.trim() ? [{ newItem: true }] : [])];
  if (!combo.opts.length) return '';
  combo.idx = Math.min(Math.max(combo.idx, 0), combo.opts.length - 1);
  return `<ul class="sugg" role="listbox" id="sugg-${i}" aria-label="Matching items">${combo.opts.map((o, k) => {
    const cls = `opt${k === combo.idx ? ' active' : ''}`;
    if (o.newItem) return `<li class="${cls} new" role="option" id="sugg-${i}-${k}" data-opt="${k}" aria-selected="${k === combo.idx}">+ New item: “${esc(l.name.trim())}”</li>`;
    const it = itemById(o.id);
    return `<li class="${cls}" role="option" id="sugg-${i}-${k}" data-opt="${k}" aria-selected="${k === combo.idx}">
      <span>${highlight(it.name, l.name)}${it.onlyAt ? ' <span class="badge excl">Only here</span>' : ''}</span><span class="muted small num">${hintPrice(it, draft.shopId, idx)}</span></li>`;
  }).join('')}</ul>`;
}

// Shows whether a line adds to an existing item or creates a new one.
const lineChipHTML = l => !l.name.trim() && !l.itemId ? ''
  : l.itemId ? '<span class="lchip existing">Existing item</span>' : '<span class="lchip new">New item</span>';

// Updates one row's chip, suggestions, "Only here" box and unit price without redrawing the table,
// so the cursor stays in the field you're typing in.
function refreshRow(i) {
  const tr = $(`table.review tr[data-i="${i}"]`); if (!tr) return;
  const l = draft.lines[i];
  const it = l.itemId ? itemById(l.itemId) : null;
  tr.querySelector('.r-chip').innerHTML = lineChipHTML(l);
  const box = tr.querySelector('.r-sugg'); box.innerHTML = comboHTML(i);
  const input = tr.querySelector('.r-name');
  const open = !!box.firstChild;
  input.setAttribute('aria-expanded', String(open));
  if (open) input.setAttribute('aria-activedescendant', `sugg-${i}-${combo.idx}`); else input.removeAttribute('aria-activedescendant');
  const ex = tr.querySelector('.r-excl');
  ex.checked = it ? it.onlyAt === draft.shopId : !!l.excl;
  ex.disabled = !!it;
  ex.title = it ? 'Change this on the item in Prices' : '';
  tr.querySelector('.r-up').innerHTML = lineUnitPriceHTML(l);
}

function openCombo(i) { combo = { i, idx: 0, opts: [] }; refreshRow(i); }
function closeCombo() { const i = combo?.i; combo = null; if (i != null) refreshRow(i); }

function pickOption(i, k) {
  const o = combo?.opts[k]; const l = draft.lines[i];
  if (!o || !l) return;
  if (o.newItem) l.itemId = '';
  else { const it = itemById(o.id); l.itemId = it.id; l.name = it.name; if (compareByFor(l.unit) !== it.compareBy && it.compareBy !== 'each') l.unit = it.compareBy; }
  combo = null;
  $('#review').innerHTML = reviewHTML();
  $(`table.review tr[data-i="${i}"] .r-amt`)?.focus();
}

function renderAdd(v) {
  if (!store) { v.innerHTML = emptyState(); return; }
  const d = draft;
  const aiReady = !!settings.aiKey;
  const canRead = aiReady && d.photos.length && d.shopId && !d.busy;
  v.innerHTML = `<div class="stack">
    <div><h2>${d.editing ? 'Edit saved prices' : 'Add prices'}</h2>
      <p class="lede">${d.editing ? 'Fix any line, then save.' : 'Pick the shop and date first so prices land in the right place on your timeline. Photos are only used to read prices and are never saved.'}</p></div>
    ${!store.canWrite ? '<div class="status">This view is read-only. Add a GitHub token in Settings to add prices.</div>' : ''}
    <section class="panel grid2">
      <div>
        ${d.editing ? '<p class="muted">Editing prices you saved earlier.</p>' : `<label class="drop" id="drop"><input type="file" id="fileIn" accept="image/*" multiple>
          <strong>Take or choose photos</strong>
          <span class="muted small">${aiReady ? 'A long bill can be several photos.' : 'Reading photos needs an Anthropic API key in Settings. You can still type prices by hand.'}</span></label>
        <div class="thumbs">${d.photos.map((p, i) => `<figure><img src="${p.url}" alt="Photo ${i + 1}"><button data-rmphoto="${i}" aria-label="Remove photo ${i + 1}">✕</button></figure>`).join('')}</div>`}
      </div>
      <div class="stack tight">
        <label class="field"><span>Shop</span><select class="input" id="shopSel">
          <option value="">Choose a shop</option>${D.shops.map(s => `<option value="${esc(s.id)}" ${s.id === d.shopId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          ${store.canWrite ? '<option value="__new">Add a new shop…</option>' : ''}</select></label>
        ${d.addingShop ? '<div class="actions"><input class="input grow" id="newShopName" placeholder="Shop name, e.g. Aldi Burwood"><button class="btn" id="newShopAdd">Add shop</button></div>' : ''}
        <label class="field"><span>Date on the bill or when you saw the price</span><input class="input" type="date" id="dateIn" value="${esc(d.date)}" max="${todayStr()}"></label>
        <div class="field"><span>Where are the prices from?</span><div class="seg">
          <label><input type="radio" name="source" value="bill" ${d.source === 'bill' ? 'checked' : ''}><span><strong>A bill</strong><br><span class="muted small">I bought these</span></span></label>
          <label><input type="radio" name="source" value="shelf" ${d.source === 'shelf' ? 'checked' : ''}><span><strong>Shelf or price list</strong><br><span class="muted small">I only looked</span></span></label>
        </div></div>
      </div>
    </section>
    ${d.lines ? '' : `<div class="actions">
      ${aiReady ? `<button class="btn primary" id="readBtn" ${canRead ? '' : 'disabled'}>Read prices from photo</button>` : ''}
      <button class="btn ${aiReady ? '' : 'primary'}" id="manualBtn" ${d.shopId ? '' : 'disabled'}>Type prices by hand</button>
      ${!d.shopId ? '<span class="muted small">Choose a shop to continue.</span>' : ''}</div>`}
    <div class="status" id="status">${d.busy ? '<span class="spin"></span><span>Reading your photo. This can take up to a minute.</span><button class="btn quiet push" id="stopBtn">Stop</button>' : esc(d.note)}</div>
    <div id="review">${d.lines ? reviewHTML() : ''}</div></div>`;
}

function reviewHTML() {
  const d = draft;
  const rows = d.lines.map((l, i) => {
    const it = l.itemId ? itemById(l.itemId) : null;
    const excl = it ? it.onlyAt === d.shopId : !!l.excl;
    return `<tr data-i="${i}">
      <td class="w-name"><div class="combo">
        <input class="input r-name" value="${esc(l.name)}" placeholder="Start typing to search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sugg-${i}" aria-label="Product">
        <div class="r-sugg">${comboHTML(i)}</div><div class="r-chip">${lineChipHTML(l)}</div></div></td>
      <td class="w-amt"><div class="amt"><input class="input r-amt num" type="number" inputmode="decimal" step="any" min="0" value="${l.amount ?? 1}" aria-label="Amount"><select class="input r-unit" aria-label="Unit">${UNIT_OPTIONS.map(u => `<option value="${u}" ${u === cleanUnit(l.unit) ? 'selected' : ''}>${u}</option>`).join('')}</select></div></td>
      <td class="r w-up r-up">${lineUnitPriceHTML(l)}</td>
      <td class="w-price"><input class="input r-price num" type="number" inputmode="decimal" step="0.01" min="0" value="${l.price ?? ''}" aria-label="Price paid"></td>
      <td class="c"><input type="checkbox" class="r-excl" ${excl ? 'checked' : ''} ${it ? 'disabled title="Change this on the item in Prices"' : ''} aria-label="Only sold at this shop"></td>
      <td><button class="iconbtn r-del" aria-label="Remove line">✕</button></td></tr>`;
  }).join('');
  return `<section class="panel stack tight">
    <div><h3>Check the prices</h3><p class="muted small">Start typing a product to search the items you already track, and pick one so its price history stays together. Pick “New item” to add it to your list. <strong>Amount</strong> is the pack size or weight the price is for (500 g, 2 L, 0.85 kg, 12 items), so different pack sizes compare fairly per kg, litre or item. Tick “Only here” for things only this shop sells, like its own brand, so they’re never compared with other shops.</p></div>
    <div class="scroll"><table class="review"><thead><tr><th>Product</th><th>Amount</th><th class="r">Unit price</th><th>Price paid</th><th class="c">Only here</th><th><span class="sr">Remove</span></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No lines yet.</td></tr>'}</tbody></table></div>
    <div class="actions"><button class="btn quiet" id="addLine">Add a line</button></div>
    <div class="actions"><button class="btn primary" id="saveDraft" ${canWrite() ? '' : 'disabled'}>${d.editing ? 'Save changes' : 'Save prices'}</button><button class="btn quiet" id="discard">Discard</button></div>
  </section>`;
}

async function addFiles(files) {
  for (const f of [...files]) {
    if (!f.type.startsWith('image/')) continue;
    if (draft.photos.length >= 6) { toast('Up to 6 photos at a time.'); break; }
    try { const blob = await prepareImage(f); draft.photos.push({ blob, url: URL.createObjectURL(blob) }); }
    catch (e) { toast(e.message); }
  }
  draft.note = ''; render();
}
function clearPhotos() { draft.photos.forEach(p => URL.revokeObjectURL(p.url)); draft.photos = []; }

async function readPhoto() {
  const d = draft;
  d.busy = true; d.note = ''; d.ctl = new AbortController(); render();
  try {
    const res = await readPrices({
      apiKey: settings.aiKey, model: settings.aiModel, images: d.photos.map(p => p.blob), kind: d.source,
      shopName: shopName(d.shopId), knownNames: allowedItems(d.shopId).map(i => i.name), signal: d.ctl.signal,
    });
    d.lines = res.items.map(x => ({ name: x.name, itemId: matchItem(x.name, d.shopId), price: x.price, amount: x.amount, unit: x.unit, excl: false }));
    let note = `Found ${plural(d.lines.length, 'price')}. ${d.lines.filter(l => l.itemId).length} matched items you already track.`;
    if (isDate(res.date) && res.date !== d.date && res.date <= todayStr()) { d.date = res.date; note += ` Date set to ${fmtDate(res.date)} from the bill.`; }
    if (!d.lines.length) { d.lines = [blankLine()]; note = 'No prices found in that photo. Type them below.'; }
    d.note = note;
  } catch (e) {
    d.note = e?.name === 'AbortError' ? 'Stopped.' : (e.message || 'Couldn’t read the photo.');
  } finally {
    d.busy = false; d.ctl = null; render();
  }
}

async function saveDraft() {
  const d = draft;
  if (!shopById(d.shopId)) { toast('Choose a shop first.'); return; }
  if (!isDate(d.date)) { toast('Enter a valid date.'); return; }
  const lines = d.lines.filter(l => (l.name.trim() || l.itemId) && Number(l.price) > 0);
  if (!lines.length) { toast('Add at least one line with a name and a price.'); return; }
  const unfit = lines.filter(l => { const it = l.itemId && itemById(l.itemId); return it && unitPrice({ price: 1, amount: 1, unit: cleanUnit(l.unit) }, it) == null; });
  if (unfit.length) { toast(`${plural(unfit.length, 'line')} ${unfit.length === 1 ? 'needs' : 'need'} an amount in the right unit, shown in red. Fix ${unfit.length === 1 ? 'it' : 'them'}, or change how the item is compared in Prices.`); return; }
  const ops = [], rows = [], newIds = new Map(), taken = new Set(D.items.map(i => i.id));
  for (const l of lines) {
    let itemId = l.itemId && allowedItems(d.shopId).some(i => i.id === l.itemId) ? l.itemId : matchItem(l.name, d.shopId);
    if (!itemId) {
      const key = norm(l.name) + '|' + (l.excl ? d.shopId : '');
      itemId = newIds.get(key);
      if (!itemId) {
        itemId = uniqueId(l.name, taken); taken.add(itemId); newIds.set(key, itemId);
        ops.push({ op: 'addItem', item: { id: itemId, name: l.name.trim(), onlyAt: l.excl ? d.shopId : null, compareBy: compareByFor(l.unit) } });
      }
    }
    rows.push({ date: d.date, shopId: d.shopId, itemId, price: Number(l.price), amount: Number(l.amount) > 0 ? Number(l.amount) : 1, unit: cleanUnit(l.unit), source: d.source });
  }
  if (d.editing) ops.unshift({ op: 'deleteVisit', ...d.editing });
  ops.push({ op: 'addPrices', rows });
  const name = shopName(d.shopId);
  const ok = await save(ops, `${d.editing ? 'Update' : 'Add'} ${plural(rows.length, 'price')} at ${name} (${d.date})`,
    `Saved ${plural(rows.length, 'price')} at ${name} for ${fmtDate(d.date)}.`);
  if (!ok) return;
  const keep = { shopId: d.shopId, date: d.date, source: d.source };
  clearPhotos(); draft = { ...freshDraft(), ...keep };
  render();
}

async function addShop(name) {
  name = String(name || '').trim();
  if (!name) { toast('Enter a shop name.'); return null; }
  if (D.shops.some(s => norm(s.name) === norm(name))) { toast('You already have a shop with that name.'); return null; }
  const used = new Set(D.shops.map(s => s.color));
  const shop = { id: uniqueId(name, new Set(D.shops.map(s => s.id))), name, color: PALETTE.find(c => !used.has(c)) || PALETTE[D.shops.length % PALETTE.length] };
  const ok = await save([{ op: 'addShop', shop }], `Add shop ${name}`, `Added ${name}.`);
  return ok ? (D.shops.find(s => norm(s.name) === norm(name)) || null) : null;
}

/* ---------------- Prices ---------------- */
let pq = '', pshop = '';
function renderPrices(v) {
  if (!D.items.length) { v.innerHTML = emptyState(); return; }
  v.innerHTML = `<div class="stack">
    <div><h2>Prices</h2><p class="lede">Every item you track, with the latest price at each shop. The highlighted price is the cheapest. Open an item to see its trend, rename it, or merge duplicates.</p></div>
    <div class="filters">
      <input class="input grow" id="q" type="search" placeholder="Search items" value="${esc(pq)}" aria-label="Search items">
      <select class="input" id="pshop" aria-label="Filter by shop"><option value="">All shops</option>${D.shops.map(s => `<option value="${esc(s.id)}" ${s.id === pshop ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    </div>
    <div class="panel flush"><div class="items" id="plist"></div></div></div>`;
  renderPriceList();
}
function renderPriceList() {
  const box = $('#plist'); if (!box) return;
  const idx = buildIndex(D), q = norm(pq);
  const list = D.items.filter(it => (!q || norm(it.name).includes(q)) && (!pshop || idx.get(it.id)?.has(pshop) || it.onlyAt === pshop))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) { box.innerHTML = '<p class="muted pad">No items match. Try a shorter search.</p>'; return; }
  box.innerHTML = list.map(it => {
    const offers = [...(idx.get(it.id) || new Map())].filter(([sid]) => shopById(sid)).map(([sid, a]) => ({ sid, p: lastOf(a).price, d: lastOf(a).date })).sort((a, b) => a.p - b.p);
    const min = offers.length > 1 ? offers[0].p : null;
    const chips = offers.length ? offers.map(o => `<span class="chip ${o.p === min ? 'cheap' : ''}" title="Last seen ${esc(fmtDate(o.d))}">${dot(o.sid)}${esc(shopName(o.sid))} <span class="num">${uprice(o.p, it.compareBy)}</span></span>`).join('') : '<span class="muted small">No price yet</span>';
    return `<button class="irow" data-item="${esc(it.id)}"><span><span class="nm">${esc(it.name)}</span>${it.onlyAt ? ` <span class="badge excl">Only at ${esc(shopName(it.onlyAt))}</span>` : ''}</span><span class="chips">${chips}</span></button>`;
  }).join('');
}

function openItem(id) {
  const it = itemById(id); if (!it) return;
  const idx = buildIndex(D);
  const series = [...(idx.get(id) || new Map())].filter(([sid]) => shopById(sid))
    .map(([sid, a]) => ({ name: shopName(sid), color: shopColor(sid), points: a.map(o => ({ x: dayNum(o.date), y: o.price })) }));
  const obs = D.prices.filter(p => p.itemId === id).sort((a, b) => b.date.localeCompare(a.date));
  const bad = conflicts(D, id);
  const mismatched = unitMismatches(D, id);
  const by = it.compareBy || 'each';
  const others = D.items.filter(x => x.id !== id).sort((a, b) => a.name.localeCompare(b.name));
  const w = store?.canWrite;
  openDlg(`
    <div class="dlg-h"><div><h3 class="dlg-title">${esc(it.name)}</h3>${it.onlyAt ? `<span class="badge excl">Only at ${esc(shopName(it.onlyAt))}</span>` : ''}</div>
      <button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <p class="muted small">Prices ${BY_LABEL[by]}.</p>
    <div class="chart">${lineChart(series, by)}</div>
    ${series.length > 1 ? `<div class="legend">${series.map(s => `<span><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`).join('')}</div>` : ''}
    ${bad.length ? `<div class="status">${plural(bad.length, 'price')} recorded at other shops ${bad.length === 1 ? 'is' : 'are'} ignored, because this item is marked as only sold at ${esc(shopName(it.onlyAt))}. If ${bad.length === 1 ? 'it’s' : 'they’re'} a different product, edit that visit in History and track it as a new item.</div>` : ''}
    ${mismatched.length ? `<div class="status">${plural(mismatched.length, 'price')} can’t be compared ${BY_LABEL[by]} because ${mismatched.length === 1 ? 'its amount is' : 'their amounts are'} in a different unit. Edit ${mismatched.length === 1 ? 'that visit' : 'those visits'} in History to add the ${by === 'kg' ? 'weight' : by === 'L' ? 'volume' : 'count'}, or change how this item is compared below.</div>` : ''}
    <div class="scroll"><table><thead><tr><th>Date</th><th>Shop</th><th class="r">Paid</th><th>Amount</th><th class="r">${esc(BY_LABEL[by][0].toUpperCase() + BY_LABEL[by].slice(1))}</th><th>From</th></tr></thead><tbody>
      ${obs.length ? obs.map(o => { const up = unitPrice(o, it); return `<tr><td class="num">${esc(fmtDate(o.date))}</td><td>${dot(o.shopId)}${esc(shopName(o.shopId))}</td><td class="r num">${money(o.price)}</td><td class="num">${esc(fmtAmount(o.amount, o.unit))}</td><td class="r num">${up == null ? '<span class="warn">Can’t compare</span>' : uprice(up, by)}</td><td class="muted small">${SOURCE_LABEL[o.source]}</td></tr>`; }).join('') : '<tr><td colspan="6" class="muted">No prices yet.</td></tr>'}
    </tbody></table></div>
    ${w ? `<div class="panel stack tight">
      <h3>Edit item</h3>
      <div class="grid2">
        <label class="field"><span>Name</span><input class="input" id="itName" value="${esc(it.name)}"></label>
        <label class="field"><span>Where it’s sold</span><select class="input" id="itOnly"><option value="">Any shop (compare prices)</option>${D.shops.map(s => `<option value="${esc(s.id)}" ${s.id === it.onlyAt ? 'selected' : ''}>Only at ${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Compare prices</span><select class="input" id="itBy">${Object.entries(BY_LABEL).map(([k, v]) => `<option value="${k}" ${k === by ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="actions"><button class="btn primary" id="itSave" data-id="${esc(id)}">Save item</button></div>
      ${others.length ? `<div class="field"><span>Same product as another item?</span><div class="actions"><select class="input grow" id="mergeInto"><option value="">Choose the item to keep</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}${o.onlyAt ? ` (only at ${esc(shopName(o.onlyAt))})` : ''}</option>`).join('')}</select><button class="btn" id="itMerge" data-id="${esc(id)}">Merge into it</button></div><span class="muted small">Moves this item’s prices to the chosen item, then removes this one.</span></div>` : ''}
      <div class="actions"><button class="btn danger" id="itDel" data-id="${esc(id)}">Delete item and its prices</button></div>
    </div>` : ''}`);
}

/* ---------------- History ---------------- */
let hshop = '', hsource = '';
function renderHistory(v) {
  if (!D.prices.length) { v.innerHTML = emptyState(); return; }
  const list = visits(D).filter(x => (!hshop || x.shopId === hshop) && (!hsource || x.source === hsource));
  const groups = new Map();
  for (const x of list) { const k = x.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  v.innerHTML = `<div class="stack">
    <div><h2>History</h2><p class="lede">Every visit you’ve recorded, filed by date, newest first. Open one to fix or delete its prices.</p></div>
    <div class="filters">
      <select class="input" id="hshop" aria-label="Filter by shop"><option value="">All shops</option>${D.shops.map(s => `<option value="${esc(s.id)}" ${s.id === hshop ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select class="input" id="hsource" aria-label="Filter by source"><option value="">Bills and shelf prices</option><option value="bill" ${hsource === 'bill' ? 'selected' : ''}>Bills only</option><option value="shelf" ${hsource === 'shelf' ? 'selected' : ''}>Shelf prices only</option></select>
    </div>
    ${list.length ? [...groups].map(([k, xs]) => `<section><h3 class="month">${esc(fmtMonth(k + '-01'))}</h3><div class="visits">${xs.map(x =>
      `<button class="visit" style="--shop:${esc(shopColor(x.shopId))}" data-visit="${esc(`${x.date}|${x.shopId}|${x.source}`)}">
        <strong>${esc(shopName(x.shopId))}</strong><span class="num small">${esc(fmtDate(x.date))}</span>
        <span class="small muted">${SOURCE_LABEL[x.source]}, ${plural(x.rows.length, 'price')}</span></button>`).join('')}</div></section>`).join('')
      : '<p class="muted">Nothing matches these filters.</p>'}</div>`;
}
function findVisit(key) { const [date, shopId, source] = key.split('|'); return visits(D).find(x => x.date === date && x.shopId === shopId && x.source === source); }
function openVisit(key) {
  const x = findVisit(key); if (!x) return;
  openDlg(`
    <div class="dlg-h"><div><h3 class="dlg-title">${dot(x.shopId)}${esc(shopName(x.shopId))}</h3><p class="muted">${esc(fmtDate(x.date))}, ${SOURCE_LABEL[x.source].toLowerCase()}</p></div><button class="iconbtn" data-close aria-label="Close">✕</button></div>
    <div class="scroll"><table><thead><tr><th>Item</th><th class="r">Paid</th><th>Amount</th><th class="r">Unit price</th></tr></thead><tbody>
      ${x.rows.map(r => { const it = itemById(r.itemId); const up = it ? unitPrice(r, it) : null; return `<tr><td>${it ? `<button class="link" data-item="${esc(it.id)}">${esc(it.name)}</button>` : esc(r.itemId)}${it?.onlyAt ? ' <span class="badge excl">Only here</span>' : ''}</td><td class="r num">${money(r.price)}</td><td class="num">${esc(fmtAmount(r.amount, r.unit))}</td><td class="r num">${up == null ? '<span class="warn">Can’t compare</span>' : uprice(up, it.compareBy)}</td></tr>`; }).join('')}
    </tbody></table></div>
    ${store?.canWrite ? `<div class="actions"><button class="btn primary" id="visitEdit" data-visit="${esc(key)}">Edit prices</button><button class="btn danger" id="visitDel" data-visit="${esc(key)}">Delete this visit</button></div>` : ''}`);
}

/* ---------------- Forecast ---------------- */
function renderForecast(v) {
  if (!D.items.length) { v.innerHTML = emptyState(); return; }
  for (const id of Object.keys(basket)) if (!itemById(id)) delete basket[id];
  const addable = D.items.filter(i => !(i.id in basket)).sort((a, b) => a.name.localeCompare(b.name));
  const lines = Object.entries(basket).map(([id, q]) => ({ it: itemById(id), q })).sort((a, b) => a.it.name.localeCompare(b.it.name));
  v.innerHTML = `<div class="stack">
    <div><h2>Forecast</h2><p class="lede">List what you buy in a typical month and how much of each, in kg, litres or items. You’ll see what that would cost at each shop now, and next month if prices keep moving the way they have.</p></div>
    <section class="panel stack tight">
      <div class="section-h"><h3>My monthly basket</h3><button class="btn quiet" id="fillBasket">Add items I’ve bought lately</button></div>
      <p class="muted small">Your basket is kept in this browser only. It isn’t saved to GitHub.</p>
      <div class="scroll"><table><thead><tr><th>Item</th><th class="w-qty">Per month</th><th><span class="sr">Remove</span></th></tr></thead><tbody>
        ${lines.map(({ it, q }) => `<tr data-bid="${esc(it.id)}"><td>${esc(it.name)}${it.onlyAt ? ` <span class="badge excl">Only at ${esc(shopName(it.onlyAt))}</span>` : ''}</td>
          <td><div class="amt"><input class="input b-qty num" type="number" min="0" step="any" value="${Number(q)}" aria-label="How much ${esc(it.name)} per month"><span class="muted small">${BY_UNIT[it.compareBy || 'each']}</span></div></td>
          <td><button class="iconbtn b-del" aria-label="Remove ${esc(it.name)}">✕</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Your basket is empty. Add items below.</td></tr>'}
      </tbody></table></div>
      ${addable.length ? `<div class="actions"><select class="input grow" id="bAdd" aria-label="Item to add"><option value="">Add an item</option>${addable.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select><button class="btn" id="bAddBtn">Add</button></div>` : ''}
    </section>
    <div id="fres"></div></div>`;
  renderForecastResults();
}
function renderForecastResults() {
  const box = $('#fres'); if (!box) return;
  const f = forecast(D, basket);
  if (!f.per.length) { box.innerHTML = ''; return; }
  const n = f.priced.length;
  const bestFull = f.shops.find(s => s.covered === n);
  const cards = f.shops.map(r => {
    const diff = r.totalNext - r.total;
    return `<div class="panel fshop" style="--shop:${esc(r.s.color)}">
      <div class="strong">${esc(r.s.name)}</div>
      <div class="big num">${money(r.total)}</div><div class="small muted">a month for your whole basket</div>
      <div class="small">Has <strong>${r.covered} of ${n}</strong> items (${money(r.here)}).${r.covered < n ? ` The other ${n - r.covered} at their cheapest shop: ${money(r.rest)}.` : ''}</div>
      <div class="small">Next month: <strong class="num">${money(r.totalNext)}</strong> <span class="num ${diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : 'muted'}">(${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))})</span></div></div>`;
  }).join('');
  const onlyHTML = f.onlyOne.size ? `<div class="status block">Some items have a price at only one shop, so plan a stop there whichever shop you choose: ${[...f.onlyOne].map(([sid, ps]) => `<strong>${esc(shopName(sid))}</strong> for ${ps.map(p => esc(p.it.name)).join(', ')}`).join('; ')}.</div>` : '';
  const cols = D.shops.filter(s => f.priced.some(p => p.offers.some(o => o.sid === s.id)));
  const matrix = `<div class="scroll"><table><thead><tr><th>Item</th><th class="r">Qty</th>${cols.map(s => `<th class="r">${dot(s.id)}${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
    ${f.per.map(p => `<tr><td>${esc(p.it.name)}${p.it.onlyAt ? ` <span class="badge excl">Only at ${esc(shopName(p.it.onlyAt))}</span>` : ''}</td><td class="r num">${p.qty} ${BY_UNIT[p.it.compareBy || 'each']}</td>
      ${cols.map(s => {
        const o = p.offers.find(o => o.sid === s.id);
        if (!o) return `<td class="r muted small">${p.it.onlyAt && p.it.onlyAt !== s.id ? 'Not sold' : 'No price'}</td>`;
        const cheapest = p.offers.length > 1 && o.now === p.offers[0].now;
        const by = p.it.compareBy || 'each';
        return `<td class="r num" title="Seen ${esc(fmtDate(o.date))}"><span class="${cheapest ? 'cheap' : ''}">${uprice(o.now, by)}</span>${o.next.toFixed(2) !== o.now.toFixed(2) ? `<br><span class="small ${o.next > o.now ? 'up' : 'down'}">${uprice(o.next, by)} next</span>` : ''}</td>`;
      }).join('')}</tr>`).join('')}
  </tbody></table></div>`;
  box.innerHTML = `<div class="stack">
    ${n ? `<section class="stack tight"><h3>What your basket costs</h3>
      <p class="summary">${bestFull ? `Doing your whole shop at <strong>${esc(bestFull.s.name)}</strong> is the cheapest single-shop option, at about <strong>${money(bestFull.total)}</strong> a month.` : 'No single shop has a price for every item yet.'}
      Buying each item where it’s cheapest${f.mixShops.size > 1 ? ` across ${f.mixShops.size} shops` : ''} would be <strong>${money(f.mix)}</strong> (${money(f.mixNext)} next month).</p>
      ${onlyHTML}<div class="fcard">${cards}</div>
      <p class="muted small">Shops are ordered by how much of your basket they carry. “Next month” follows each shop’s own price trend for an item once it has 3 or more prices over at least 3 weeks; otherwise it uses the latest price.</p></section>` : ''}
    ${f.unpriced.length ? `<p class="muted">No prices yet for ${f.unpriced.map(p => esc(p.it.name)).join(', ')}.</p>` : ''}
    ${n ? `<section class="panel"><h3 class="section-h">Item by item</h3>${matrix}</section>` : ''}</div>`;
}

/* ---------------- Shops ---------------- */
function renderShops(v) {
  if (!store) { v.innerHTML = emptyState(); return; }
  const counts = new Map(); for (const p of D.prices) counts.set(p.shopId, (counts.get(p.shopId) || 0) + 1);
  const w = store.canWrite;
  v.innerHTML = `<div class="stack">
    <div><h2>Shops</h2><p class="lede">Give each shop a name you’ll recognise. If two branches of a chain have different prices, add them as separate shops.</p></div>
    <section class="panel stack tight">
      ${D.shops.length ? `<div class="scroll"><table><thead><tr><th>Colour</th><th>Name</th><th class="r">Prices</th><th><span class="sr">Delete</span></th></tr></thead><tbody>
        ${D.shops.map(s => `<tr data-sid="${esc(s.id)}"><td class="w-color"><input type="color" class="s-color" value="${esc(s.color)}" ${w ? '' : 'disabled'} aria-label="Colour for ${esc(s.name)}"></td>
          <td><input class="input s-name" value="${esc(s.name)}" ${w ? '' : 'disabled'} aria-label="Shop name"></td><td class="r num">${counts.get(s.id) || 0}</td>
          <td class="r">${w ? `<button class="btn danger s-del" ${counts.get(s.id) ? 'disabled title="Delete its visits in History first"' : ''}>Delete</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No shops yet.</p>'}
      ${w ? '<div class="actions"><input class="input grow" id="shopNew" placeholder="Shop name, e.g. Coles Strathfield" aria-label="New shop name"><button class="btn primary" id="shopAdd">Add shop</button></div>' : ''}
    </section></div>`;
}

/* ---------------- Settings ---------------- */
function renderSettings(v) {
  const det = detectRepo();
  const s = settings;
  v.innerHTML = `<div class="stack">
    <div><h2>Settings</h2><p class="lede">These are saved in this browser on this device only. Nothing here is written to GitHub.</p></div>
    <section class="panel stack tight">
      <h3>Where your prices are kept</h3>
      <div class="seg">
        <label><input type="radio" name="mode" value="github" ${s.mode !== 'local' ? 'checked' : ''}><span><strong>GitHub repository</strong><br><span class="muted small">Kept as CSV files you can share</span></span></label>
        <label><input type="radio" name="mode" value="local" ${s.mode === 'local' ? 'checked' : ''}><span><strong>This browser only</strong><br><span class="muted small">For trying the app out</span></span></label>
      </div>
      <div class="grid3 ${s.mode === 'local' ? 'hidden' : ''}" id="ghFields">
        <label class="field"><span>Owner</span><input class="input" id="sOwner" value="${esc(s.owner)}" placeholder="${esc(det?.owner || 'your-github-name')}" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Repository</span><input class="input" id="sRepo" value="${esc(s.repo)}" placeholder="${esc(det?.repo || 'pricewatch')}" autocapitalize="off" spellcheck="false"></label>
        <label class="field"><span>Branch</span><input class="input" id="sBranch" value="${esc(s.branch)}" placeholder="main" autocapitalize="off" spellcheck="false"></label>
        <label class="field span3"><span>GitHub token</span><input class="input" id="sToken" type="password" value="${esc(s.token)}" placeholder="github_pat_…" autocomplete="off">
          <span class="muted small">Needed to save. Without it you can only look. Create a fine-grained token with access to just this repository and the permission “Contents: Read and write”. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token on GitHub</a>.</span></label>
      </div>
      <div class="actions"><button class="btn primary" id="connect">Save and connect</button></div>
    </section>
    <section class="panel stack tight">
      <h3>Reading prices from photos</h3>
      <p class="muted small">Optional. Uses your own Anthropic API key, and each photo read is billed to your Anthropic account. Photos go straight from this browser to Anthropic and are never saved to GitHub.</p>
      <div class="grid2">
        <label class="field"><span>Anthropic API key</span><input class="input" id="sAiKey" type="password" value="${esc(s.aiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="field"><span>Model</span><input class="input" id="sAiModel" value="${esc(s.aiModel)}" placeholder="${DEFAULT_MODEL}" autocapitalize="off" spellcheck="false"></label>
      </div>
      <div class="actions"><button class="btn" id="saveAi">Save photo reading</button></div>
    </section>
    <section class="panel stack tight">
      <h3>Display</h3>
      <label class="field narrow"><span>Currency symbol</span><input class="input" id="sCur" value="${esc(s.currency)}" maxlength="4"></label>
    </section>
    <section class="panel stack tight">
      <h3>Your data</h3>
      <div class="actions">
        <button class="btn quiet" id="dlData" ${D.shops.length || D.items.length || D.prices.length ? '' : 'disabled'}>Download the CSV files</button>
        <button class="btn danger" id="forget">Forget keys on this device</button>
      </div>
    </section></div>`;
}

function downloadFile(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  if (t.dataset.tab) { setTab(t.dataset.tab); return; }
  if (t.dataset.go) { closeDlg(); setTab(t.dataset.go); return; }
  if (t.hasAttribute('data-close')) { closeDlg(); return; }
  if (t.dataset.item && !t.id) { openItem(t.dataset.item); return; }
  if (t.dataset.visit && !t.id) { openVisit(t.dataset.visit); return; }
  if (t.dataset.rmphoto != null) { const p = draft.photos.splice(Number(t.dataset.rmphoto), 1)[0]; if (p) URL.revokeObjectURL(p.url); render(); return; }

  switch (t.id) {
    case 'refresh': load(); return;
    case 'readBtn': readPhoto(); return;
    case 'stopBtn': draft.ctl?.abort(); return;
    case 'manualBtn': draft.lines = [blankLine()]; draft.note = ''; combo = null; render(); $('table.review .r-name')?.focus(); return;
    case 'addLine': draft.lines.push(blankLine()); combo = null; $('#review').innerHTML = reviewHTML(); $(`table.review tr[data-i="${draft.lines.length - 1}"] .r-name`)?.focus(); return;
    case 'discard': { clearPhotos(); const keep = { shopId: draft.shopId, source: draft.source }; draft = { ...freshDraft(), ...keep }; render(); return; }
    case 'saveDraft': t.disabled = true; t.textContent = 'Saving…'; await saveDraft(); if (t.isConnected) { t.disabled = false; t.textContent = 'Save prices'; } return;
    case 'newShopAdd': { const s = await addShop($('#newShopName').value); if (s) { draft.shopId = s.id; draft.addingShop = false; } render(); return; }
    case 'shopAdd': { await addShop($('#shopNew').value); render(); return; }
    case 'itSave': {
      const name = $('#itName').value.trim(); if (!name) { toast('Enter a name.'); return; }
      if (await save([{ op: 'updateItem', id: t.dataset.id, name, onlyAt: $('#itOnly').value || null, compareBy: $('#itBy').value }], `Update item ${name}`, 'Item saved.')) { openItem(t.dataset.id); render(); }
      return;
    }
    case 'itMerge': {
      const from = t.dataset.id, into = $('#mergeInto').value;
      if (!into) { toast('Choose the item to keep.'); return; }
      armConfirm(t, `Merge into “${itemById(into)?.name}”?`, async () => {
        if (await save([{ op: 'mergeItems', from, into }], `Merge ${itemById(from)?.name} into ${itemById(into)?.name}`, 'Merged.')) {
          if (from in basket) { basket[into] = (Number(basket[into]) || 0) + Number(basket[from]); delete basket[from]; saveBasket(); }
          openItem(into); render();
        }
      });
      return;
    }
    case 'itDel': {
      const id = t.dataset.id;
      armConfirm(t, 'Click again to delete', async () => {
        if (await save([{ op: 'deleteItem', id }], `Delete item ${itemById(id)?.name}`, 'Item deleted.')) { delete basket[id]; saveBasket(); closeDlg(); render(); }
      });
      return;
    }
    case 'visitEdit': {
      const x = findVisit(t.dataset.visit); if (!x) return;
      clearPhotos();
      draft = { ...freshDraft(), shopId: x.shopId, date: x.date, source: x.source, editing: { date: x.date, shopId: x.shopId, source: x.source },
        lines: x.rows.map(r => ({ name: itemById(r.itemId)?.name || r.itemId, itemId: itemById(r.itemId) ? r.itemId : '', price: r.price, amount: r.amount, unit: r.unit, excl: false })) };
      closeDlg(); setTab('add'); return;
    }
    case 'visitDel': {
      const x = findVisit(t.dataset.visit); if (!x) return;
      armConfirm(t, 'Click again to delete', async () => {
        if (await save([{ op: 'deleteVisit', date: x.date, shopId: x.shopId, source: x.source }], `Delete ${shopName(x.shopId)} visit (${x.date})`, 'Visit deleted.')) { closeDlg(); render(); }
      });
      return;
    }
    case 'fillBasket': {
      const ids = recentlyBought(D).filter(id => !(id in basket));
      if (!ids.length) { toast('No new items from bills in the last 90 days. Add items below instead.'); return; }
      ids.forEach(id => { basket[id] = 1; }); saveBasket(); render();
      toast(`Added ${plural(ids.length, 'item')}. Set how much of each you buy a month.`); return;
    }
    case 'bAddBtn': { const id = $('#bAdd').value; if (!id) return; basket[id] = 1; saveBasket(); render(); return; }
    case 'connect': {
      settings.mode = $('input[name=mode]:checked')?.value || 'github';
      if (settings.mode === 'github') {
        settings.owner = $('#sOwner').value.trim(); settings.repo = $('#sRepo').value.trim();
        settings.branch = $('#sBranch').value.trim() || 'main'; settings.token = $('#sToken').value.trim();
      }
      saveSettings(); await load();
      if (!loadError && store) toast(store.canWrite ? `Connected to ${store.label}.` : `Connected to ${store.label} (read-only).`);
      return;
    }
    case 'saveAi': settings.aiKey = $('#sAiKey').value.trim(); settings.aiModel = $('#sAiModel').value.trim() || DEFAULT_MODEL; saveSettings(); toast('Photo reading settings saved.'); render(); return;
    case 'dlData': { const out = serialize(D); downloadFile('shops.csv', out.shops); downloadFile('items.csv', out.items); downloadFile('prices.csv', out.prices); return; }
    case 'forget':
      armConfirm(t, 'Click again to forget', async () => { settings.token = ''; settings.aiKey = ''; saveSettings(); await load(); toast('Keys removed from this device.'); });
      return;
  }
  if (t.classList.contains('r-del')) { draft.lines.splice(Number(t.closest('tr').dataset.i), 1); combo = null; $('#review').innerHTML = reviewHTML(); return; }
  if (t.classList.contains('b-del')) { delete basket[t.closest('tr').dataset.bid]; saveBasket(); render(); return; }
  if (t.classList.contains('s-del')) {
    const id = t.closest('tr').dataset.sid;
    armConfirm(t, 'Confirm', async () => { if (await save([{ op: 'deleteShop', id }], `Delete shop ${shopName(id)}`, 'Shop deleted.')) render(); });
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'fileIn') { addFiles(t.files); t.value = ''; return; }
  if (t.id === 'shopSel') {
    if (t.value === '__new') { draft.addingShop = true; render(); $('#newShopName')?.focus(); return; }
    draft.shopId = t.value; draft.addingShop = false;
    draft.lines?.forEach(l => { const it = itemById(l.itemId); if (it?.onlyAt && it.onlyAt !== draft.shopId) l.itemId = ''; });
    render(); return;
  }
  if (t.id === 'dateIn') { draft.date = t.value; return; }
  if (t.name === 'source') { draft.source = t.value; return; }
  if (t.name === 'mode') { $('#ghFields')?.classList.toggle('hidden', t.value === 'local'); return; }
  if (t.classList.contains('r-excl')) { draft.lines[Number(t.closest('tr').dataset.i)].excl = t.checked; return; }
  if (t.classList.contains('r-unit')) { const tr = t.closest('tr'); const l = draft.lines[Number(tr.dataset.i)]; l.unit = t.value; tr.querySelector('.r-up').innerHTML = lineUnitPriceHTML(l); return; }
  if (t.id === 'pshop') { pshop = t.value; renderPriceList(); return; }
  if (t.id === 'hshop') { hshop = t.value; render(); return; }
  if (t.id === 'hsource') { hsource = t.value; render(); return; }
  if (t.classList.contains('b-qty')) { basket[t.closest('tr').dataset.bid] = Math.max(0, Number(t.value) || 0); saveBasket(); renderForecastResults(); return; }
  if (t.classList.contains('s-name')) {
    const id = t.closest('tr').dataset.sid, name = t.value.trim(), s = shopById(id);
    if (s && name && name !== s.name) { if (!(await save([{ op: 'updateShop', id, name }], `Rename shop to ${name}`, 'Shop renamed.'))) t.value = s.name; }
    else if (s) t.value = s.name;
    return;
  }
  if (t.classList.contains('s-color')) { const id = t.closest('tr').dataset.sid; await save([{ op: 'updateShop', id, color: t.value }], `Change colour of ${shopName(id)}`); return; }
  if (t.id === 'sCur') { const c = t.value.trim(); if (c) { settings.currency = c; saveSettings(); toast('Currency updated.'); } }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.closest('table.review')) {
    const l = draft.lines[Number(t.closest('tr').dataset.i)]; if (!l) return;
    if (t.classList.contains('r-name')) {
      const i = Number(t.closest('tr').dataset.i);
      l.name = t.value;
      l.itemId = matchItem(t.value, draft.shopId); // exact name match links automatically
      combo = { i, idx: 0, opts: [] };
      refreshRow(i);
      return;
    }
    if (t.classList.contains('r-price')) l.price = t.value;
    if (t.classList.contains('r-amt')) l.amount = t.value;
    if (t.classList.contains('r-price') || t.classList.contains('r-amt')) t.closest('tr').querySelector('.r-up').innerHTML = lineUnitPriceHTML(l);
    return;
  }
  if (t.id === 'q') { pq = t.value; renderPriceList(); }
});
document.addEventListener('keydown', e => {
  if (e.target.classList?.contains('r-name')) {
    const i = Number(e.target.closest('tr').dataset.i);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!combo || combo.i !== i) { openCombo(i); return; }
      const n = combo.opts.length; if (!n) return;
      combo.idx = (combo.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; refreshRow(i);
      $(`#sugg-${i}-${combo.idx}`)?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter' && combo?.i === i && combo.opts.length) { e.preventDefault(); pickOption(i, combo.idx); return; }
    if (e.key === 'Escape' && combo) { e.preventDefault(); closeCombo(); return; }
    return;
  }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'shopNew') $('#shopAdd')?.click();
  if (e.target.id === 'newShopName') $('#newShopAdd')?.click();
});
document.addEventListener('dragover', e => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', e => { e.target.closest?.('#drop')?.classList.remove('over'); });
document.addEventListener('drop', e => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); addFiles(e.dataTransfer.files); } });
$('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') closeDlg(); });
// Suggestions: pick with a click or tap (mousedown keeps the cursor in the field), close when leaving the field.
document.addEventListener('mousedown', e => {
  const li = e.target.closest?.('.sugg [data-opt]'); if (!li) return;
  e.preventDefault();
  pickOption(Number(li.closest('tr').dataset.i), Number(li.dataset.opt));
});
document.addEventListener('focusin', e => {
  const t = e.target;
  if (t.classList?.contains('r-name')) { const i = Number(t.closest('tr').dataset.i); if (combo?.i !== i) { if (combo) closeCombo(); if (t.value.trim()) openCombo(i); } }
});
document.addEventListener('focusout', e => {
  if (!e.target.classList?.contains('r-name')) return;
  const i = Number(e.target.closest('tr').dataset.i);
  setTimeout(() => { if (combo?.i === i && !document.activeElement?.closest?.(`tr[data-i="${i}"] .combo`)) closeCombo(); }, 0);
});
// Pick up other people's changes when you come back to the tab.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store && !saving && !draft.lines && !draft.busy && Date.now() - loadedAt > 120000) load();
});

/* ---------------- start ---------------- */
setTab(makeStore() ? 'compare' : 'settings');
load();
