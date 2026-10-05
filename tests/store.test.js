// Tests GitHubStore against a small fake of the GitHub API (no network needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore } from '../js/store.js';

function fakeGitHub(files) {
  const commits = new Map([['c0', { tree: 't0', files: { ...files } }]]);
  const trees = new Map([['t0', { ...files }]]);
  const state = { head: 'c0', n: 0, raceOnce: false, patches: 0 };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url); const path = u.pathname.replace('/repos/me/prices', ''); const method = opts.method || 'GET';
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) return json({ object: { sha: state.head } });
    if (method === 'GET' && path.startsWith('/contents/')) {
      const f = commits.get(u.searchParams.get('ref')).files[path.slice('/contents/'.length)];
      return f == null ? json({ message: 'Not Found' }, 404) : new Response(f);
    }
    if (method === 'GET' && path.startsWith('/git/commits/')) return json({ tree: { sha: commits.get(path.split('/').pop()).tree } });
    const body = JSON.parse(opts.body || '{}');
    if (method === 'POST' && path === '/git/trees') {
      const t = { ...trees.get(body.base_tree) }; for (const e of body.tree) t[e.path] = e.content;
      const id = 't' + (++state.n); trees.set(id, t); return json({ sha: id });
    }
    if (method === 'POST' && path === '/git/commits') {
      const id = 'c' + (++state.n); commits.set(id, { tree: body.tree, files: trees.get(body.tree), parent: body.parents[0], message: body.message }); return json({ sha: id });
    }
    if (method === 'PATCH' && path.startsWith('/git/refs/heads/')) {
      state.patches++;
      if (state.raceOnce) {
        // Someone else commits first: add a shop directly.
        state.raceOnce = false;
        const other = { ...commits.get(state.head).files };
        other['data/shops.csv'] += 'coles,Coles,#C2571A\n';
        commits.set('cX', { tree: 'tX', files: other }); trees.set('tX', other); state.head = 'cX';
        return json({ message: 'Update is not a fast forward' }, 422);
      }
      if (commits.get(body.sha).parent !== state.head) return json({ message: 'not fast forward' }, 422);
      state.head = body.sha; return json({});
    }
    return json({ message: 'unexpected ' + method + ' ' + path }, 500);
  };
  return { state, commits };
}

const start = {
  'data/shops.csv': 'id,name,color\naldi,Aldi,#2D7A4D\n',
  'data/items.csv': 'id,name,only_at_shop_id\nmilk,Milk,\n',
  'data/prices.csv': 'date,shop_id,item_id,price,source\n',
};
const store = () => new GitHubStore({ owner: 'me', repo: 'prices', branch: 'main', token: 'x' });

test('save writes one commit with the new rows', async () => {
  const gh = fakeGitHub(start);
  const d = await store().save([{ op: 'addPrices', rows: [{ date: '2026-10-01', shopId: 'aldi', itemId: 'milk', price: 3.2, source: 'bill' }] }], 'Add 1 price');
  assert.equal(d.prices.length, 1);
  const head = gh.commits.get(gh.state.head);
  assert.equal(head.message, 'Add 1 price');
  assert.match(head.files['data/prices.csv'], /2026-10-01,aldi,milk,3.20,1,each,bill/);
});

test('if someone else saves first, both changes are kept', async () => {
  const gh = fakeGitHub(start);
  gh.state.raceOnce = true;
  await store().save([{ op: 'addItem', item: { id: 'bread', name: 'Bread', onlyAt: null } }], 'Add bread');
  const files = gh.commits.get(gh.state.head).files;
  assert.match(files['data/shops.csv'], /coles,Coles/);
  assert.match(files['data/items.csv'], /bread,Bread/);
  assert.equal(gh.state.patches, 2);
});

test('missing files load as empty', async () => {
  fakeGitHub({});
  const d = await store().load();
  assert.deepEqual(d, { shops: [], items: [], prices: [] });
});
