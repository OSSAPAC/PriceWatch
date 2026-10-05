// Where the CSV files are read from and written to.
//
//   GitHubStore    reads and writes data/*.csv in a GitHub repository. Each save is one commit.
//   ReadOnlyStore  reads data/*.csv next to the page (e.g. on GitHub Pages) for people without a token.
//   LocalStore     keeps the files in this browser only. For trying the app out.
//
// Every store has: label, canWrite, load() -> data, save(ops, message) -> data.

import { FILES, applyOps, emptyData, parseData, serialize } from './data.js';

export class StoreError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class GitHubStore {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token });
    this.label = `${owner}/${repo}`;
    this.canWrite = !!token;
  }

  async api(path, opts = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${path}`, {
        cache: 'no-store',
        ...opts,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...opts.headers,
        },
      });
    } catch {
      throw new StoreError('Can’t reach GitHub. Check your internet connection.', 0);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* not JSON */ }
      throw new StoreError(this.explain(res.status, detail, res.headers.get('x-ratelimit-remaining')), res.status);
    }
    return res;
  }

  explain(status, detail, remaining) {
    if (status === 401) return 'GitHub didn’t accept the token. Create a new one and paste it in Settings.';
    if (status === 403 && remaining === '0') return 'GitHub’s request limit was reached. Wait an hour, or add a token in Settings (it raises the limit).';
    if (status === 403) return `The token can’t change ${this.label}. Give it “Contents: Read and write” access to this repository.`;
    if (status === 404) return `Can’t find ${this.label} (branch “${this.branch}”). Check the names in Settings${this.token ? ' and that the token can access this repository' : ', or add a token if the repository is private'}.`;
    if (status === 409) return `${this.label} is empty. Add at least one file to it on GitHub first.`;
    if (status === 422) return 'Someone else saved at the same moment.';
    return `GitHub error ${status}${detail ? ': ' + detail : ''}`;
  }

  async headSha() {
    const r = await (await this.api(`/git/ref/heads/${encodeURIComponent(this.branch)}`)).json();
    return r.object.sha;
  }

  async readFile(path, ref) {
    try {
      const r = await this.api(`/contents/${path}?ref=${ref}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      return await r.text();
    } catch (e) {
      if (e.status === 404) return '';
      throw e;
    }
  }

  async loadRaw() {
    const sha = await this.headSha();
    const texts = {};
    await Promise.all(Object.entries(FILES).map(async ([k, p]) => { texts[k] = await this.readFile(p, sha); }));
    return { sha, texts };
  }

  async load() {
    return parseData((await this.loadRaw()).texts);
  }

  // Re-reads the latest files, applies the changes, and commits.
  // If someone else committed in between, it starts over (up to 4 tries).
  async save(ops, message) {
    if (!this.canWrite) throw new StoreError('Add a GitHub token in Settings to save changes.', 0);
    for (let attempt = 0; attempt < 4; attempt++) {
      const { sha, texts } = await this.loadRaw();
      const next = applyOps(parseData(texts), ops);
      const out = serialize(next);
      const changed = Object.keys(FILES).filter(k => out[k] !== texts[k]);
      if (!changed.length) return next;
      const base = await (await this.api(`/git/commits/${sha}`)).json();
      const tree = await (await this.api('/git/trees', {
        method: 'POST',
        body: JSON.stringify({
          base_tree: base.tree.sha,
          tree: changed.map(k => ({ path: FILES[k], mode: '100644', type: 'blob', content: out[k] })),
        }),
      })).json();
      const commit = await (await this.api('/git/commits', {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [sha] }),
      })).json();
      try {
        await this.api(`/git/refs/heads/${encodeURIComponent(this.branch)}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commit.sha, force: false }),
        });
        return next;
      } catch (e) {
        if (e.status === 422 && attempt < 3) { await new Promise(r => setTimeout(r, 400 + Math.random() * 600)); continue; }
        throw e;
      }
    }
    throw new StoreError('Couldn’t save because the repository kept changing. Try again.', 0);
  }
}

export class ReadOnlyStore {
  constructor(label = 'this site') { this.label = label; this.canWrite = false; }
  async load() {
    const texts = {};
    await Promise.all(Object.entries(FILES).map(async ([k, p]) => {
      try {
        const r = await fetch(`./${p}?t=${Date.now()}`, { cache: 'no-store' });
        texts[k] = r.ok ? await r.text() : '';
      } catch { texts[k] = ''; }
    }));
    return parseData(texts);
  }
  async save() { throw new StoreError('This view is read-only. Add a GitHub token in Settings to make changes.', 0); }
}

const LOCAL_KEY = 'pricewatch:local-data';
export class LocalStore {
  constructor() { this.label = 'this browser'; this.canWrite = true; }
  async load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      return raw ? parseData(raw) : emptyData();
    } catch { return emptyData(); }
  }
  async save(ops) {
    const next = applyOps(await this.load(), ops);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(serialize(next))); }
    catch { throw new StoreError('This browser’s storage is full or switched off.', 0); }
    return next;
  }
}

// If the page is served from <owner>.github.io/<repo>/, work out the repository.
export function detectRepo(loc = location) {
  const m = loc.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return null;
  const first = loc.pathname.split('/').filter(Boolean)[0];
  const repo = first && !first.includes('.') ? first : `${m[1]}.github.io`;
  return { owner: m[1], repo };
}
