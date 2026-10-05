import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCSV, toCSV, parseData, serialize, applyOps, emptyData, uniqueId,
  buildIndex, ranking, gaps, forecast, project, visits, recentlyBought, conflicts,
  unitPrice, unitMismatches, lastOf,
} from '../js/data.js';

const sample = () => parseData({
  shops: 'id,name,color\naldi,Aldi,#2D7A4D\ncoles,Coles,#C2571A\n',
  items: 'id,name,only_at_shop_id\nmilk-2l,Milk 2L,\nbread,Bread,\naldi-choc,Aldi Choc,aldi\n',
  prices: [
    'date,shop_id,item_id,price,source',
    '2026-08-01,aldi,milk-2l,3.10,bill',
    '2026-08-01,aldi,bread,2.50,bill',
    '2026-08-01,aldi,aldi-choc,4.00,bill',
    '2026-08-03,coles,milk-2l,3.60,shelf',
    '2026-08-03,coles,bread,3.00,shelf',
    '2026-09-01,aldi,milk-2l,3.30,shelf',
  ].join('\n'),
});

test('CSV round trip keeps commas, quotes and new lines', () => {
  const rows = [['a,b', 'say "hi"', 'two\nlines'], ['plain', '', 'x']];
  assert.deepEqual(parseCSV(toCSV(['h1', 'h2', 'h3'], rows)).slice(1), rows);
});

test('parseData ignores bad rows and column order', () => {
  const d = parseData({
    shops: 'name,id\nAldi,aldi\n',
    items: 'id,name\nmilk,Milk\n',
    prices: 'date,shop_id,item_id,price,source\n2026-01-01,aldi,milk,2.5,bill\nnot-a-date,aldi,milk,1,bill\n2026-01-02,aldi,milk,0,bill\n',
  });
  assert.equal(d.shops[0].id, 'aldi');
  assert.equal(d.prices.length, 1);
});

test('old files without amount columns load as one item per price', () => {
  const d = sample();
  assert.equal(d.prices[0].amount, 1);
  assert.equal(d.prices[0].unit, 'each');
  assert.equal(d.items[0].compareBy, 'each');
});

test('serialize writes date, shop, item, price, amount, unit and source', () => {
  const out = serialize(sample());
  assert.equal(out.prices.split('\n')[0], 'date,shop_id,item_id,price,amount,unit,source');
  assert.match(out.prices, /2026-08-01,aldi,bread,2.50,1,each,bill/);
  assert.match(out.items, /milk-2l,Milk 2L,,each/);
  assert.deepEqual(serialize(parseData(out)), out); // saving twice gives identical files
});

test('uniqueId avoids taken ids', () => {
  assert.equal(uniqueId('Milk 2L', new Set(['milk-2l'])), 'milk-2l-2');
});

test('addItem reuses an item that someone else just added with the same name', () => {
  const d = sample();
  const next = applyOps(d, [
    { op: 'addItem', item: { id: 'milk-2l-x', name: 'milk 2l', onlyAt: null } },
    { op: 'addPrices', rows: [{ date: '2026-10-01', shopId: 'coles', itemId: 'milk-2l-x', price: 3.7, source: 'bill' }] },
  ]);
  assert.equal(next.items.length, 3);
  assert.equal(next.prices.at(-1).itemId, 'milk-2l');
});

test('addItem with a clashing id gets a new id and its prices follow', () => {
  const next = applyOps(sample(), [
    { op: 'addItem', item: { id: 'bread', name: 'Sourdough', onlyAt: null } },
    { op: 'addPrices', rows: [{ date: '2026-10-01', shopId: 'aldi', itemId: 'bread', price: 5, source: 'shelf' }] },
  ]);
  const sour = next.items.find(i => i.name === 'Sourdough');
  assert.equal(sour.id, 'sourdough');
  assert.equal(next.prices.at(-1).itemId, 'sourdough');
});

test('only-at items are kept out of other shops and out of the ranking', () => {
  const d = applyOps(sample(), [{ op: 'addPrices', rows: [{ date: '2026-09-02', shopId: 'coles', itemId: 'aldi-choc', price: 9, source: 'shelf' }] }]);
  const idx = buildIndex(d);
  assert.equal(idx.get('aldi-choc').has('coles'), false);
  assert.equal(conflicts(d, 'aldi-choc').length, 1);
  const { rows, shared } = ranking(d, idx);
  assert.equal(shared, 2);
  assert.equal(rows[0].shop.id, 'aldi');
});

test('gaps lists the biggest difference first', () => {
  const g = gaps(sample());
  assert.equal(g[0].it.id, 'bread');
});

test('mergeItems and deleteItem', () => {
  let d = applyOps(sample(), [{ op: 'addItem', item: { id: 'milk', name: 'Milk two litre', onlyAt: null } },
    { op: 'addPrices', rows: [{ date: '2026-09-05', shopId: 'coles', itemId: 'milk', price: 3.5, source: 'bill' }] }]);
  d = applyOps(d, [{ op: 'mergeItems', from: 'milk', into: 'milk-2l' }]);
  assert.equal(d.items.some(i => i.id === 'milk'), false);
  assert.equal(d.prices.filter(p => p.itemId === 'milk-2l').length, 4);
  d = applyOps(d, [{ op: 'deleteItem', id: 'bread' }]);
  assert.equal(d.prices.some(p => p.itemId === 'bread'), false);
});

test('deleteShop refuses while prices exist', () => {
  assert.throws(() => applyOps(sample(), [{ op: 'deleteShop', id: 'aldi' }]));
  const d = applyOps(emptyData(), [{ op: 'addShop', shop: { id: 'x', name: 'X' } }, { op: 'deleteShop', id: 'x' }]);
  assert.equal(d.shops.length, 0);
});

test('deleteVisit then addPrices replaces a visit', () => {
  const d = applyOps(sample(), [
    { op: 'deleteVisit', date: '2026-08-03', shopId: 'coles', source: 'shelf' },
    { op: 'addPrices', rows: [{ date: '2026-08-03', shopId: 'coles', itemId: 'bread', price: 2.9, source: 'shelf' }] },
  ]);
  const v = visits(d).find(x => x.shopId === 'coles');
  assert.equal(v.rows.length, 1);
  assert.equal(v.rows[0].price, 2.9);
});

test('project follows a steady trend and needs enough history', () => {
  const a = [{ date: '2026-07-01', price: 3 }, { date: '2026-08-01', price: 3.1 }, { date: '2026-09-01', price: 3.2 }];
  assert.ok(project(a, 30, '2026-09-01') > 3.2);
  assert.equal(project(a.slice(0, 2), 30, '2026-09-01'), 3.1);
});

test('forecast totals and cheapest mix', () => {
  const f = forecast(sample(), { 'milk-2l': 2, bread: 1, 'aldi-choc': 1 }, undefined, '2026-09-10');
  const aldi = f.shops.find(s => s.s.id === 'aldi');
  assert.equal(aldi.covered, 3);
  assert.equal(Math.round(aldi.total * 100), Math.round((3.3 * 2 + 2.5 + 4) * 100));
  assert.equal(f.onlyOne.get('aldi').length, 1);
});

test('recentlyBought uses bills only', () => {
  assert.deepEqual(recentlyBought(sample(), 90, '2026-09-10').sort(), ['aldi-choc', 'bread', 'milk-2l']);
});

const weighed = () => parseData({
  shops: 'id,name\naldi,Aldi\ncoles,Coles\n',
  items: 'id,name,only_at_shop_id,compare_by\nmilk,Milk,,L\ntomatoes,Tomatoes,,kg\n',
  prices: [
    'date,shop_id,item_id,price,amount,unit,source',
    '2026-09-01,aldi,milk,3.10,2,L,bill',        // 1.55 /L
    '2026-09-02,coles,milk,4.20,3,L,shelf',      // 1.40 /L  -> cheaper per litre despite the higher price
    '2026-09-01,aldi,tomatoes,3.40,0.85,kg,bill', // 4.00 /kg
    '2026-09-02,coles,tomatoes,2.25,500,g,shelf', // 4.50 /kg
    '2026-09-03,coles,tomatoes,3.00,1,each,shelf', // no weight: can't compare per kg
  ].join('\n'),
});

test('unit prices convert g, kg, ml and L', () => {
  assert.equal(unitPrice({ price: 2.25, amount: 500, unit: 'g' }, { compareBy: 'kg' }), 4.5);
  assert.equal(unitPrice({ price: 0.9, amount: 600, unit: 'ml' }, { compareBy: 'L' }), 1.5);
  assert.equal(unitPrice({ price: 6, amount: 12, unit: 'each' }, { compareBy: 'each' }), 0.5);
  assert.equal(unitPrice({ price: 3, amount: 1, unit: 'each' }, { compareBy: 'kg' }), null);
});

test('different pack sizes are compared per litre and per kg', () => {
  const d = weighed();
  const idx = buildIndex(d);
  assert.equal(Math.round(lastOf(idx.get('milk').get('coles')).price * 100), 140);
  assert.equal(Math.round(lastOf(idx.get('tomatoes').get('coles')).price * 100), 450);
  const { rows } = ranking(d, idx);
  assert.equal(rows[0].wins, 1); // each shop is cheapest on one item
  assert.equal(unitMismatches(d, 'tomatoes').length, 1);
});

test('forecast multiplies the unit price by the amount per month', () => {
  const f = forecast(weighed(), { milk: 8, tomatoes: 2 }, undefined, '2026-09-10');
  const coles = f.shops.find(s => s.s.id === 'coles');
  assert.equal(Math.round(coles.total * 100), Math.round((1.4 * 8 + 4.5 * 2) * 100));
});

test('round trip keeps amounts and units', () => {
  const out = serialize(weighed());
  assert.match(out.prices, /2026-09-01,aldi,tomatoes,3.40,0.85,kg,bill/);
  assert.match(out.prices, /2026-09-02,coles,tomatoes,2.25,500,g,shelf/);
  assert.deepEqual(serialize(parseData(out)), out);
});
