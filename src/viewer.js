/**
 * AustLII Viewer — search + browse UI for the local legal corpus.
 * Run: node src/viewer.js   (opens on http://localhost:4242)
 */
import { createServer } from 'http';
import { getDb, search, stats } from './db.js';

const PORT = process.env.PORT || 4242;

// ─── HTML shell ──────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AustLII Legal Corpus</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:     #0f1117;
    --surface:#1a1d27;
    --border: #2a2d3a;
    --accent: #4f8ef7;
    --accent2:#7c5cfc;
    --text:   #e2e4ec;
    --muted:  #6b7280;
    --green:  #34d399;
    --amber:  #fbbf24;
    --red:    #f87171;
  }

  body { background: var(--bg); color: var(--text); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size: 14px; min-height: 100vh; }

  /* ── Layout ── */
  .app { display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 18px; font-weight: 700; white-space: nowrap; }
  header h1 span { color: var(--accent); }

  .main { display: grid; grid-template-columns: 260px 1fr; height: calc(100vh - 57px); }
  aside { background: var(--surface); border-right: 1px solid var(--border); padding: 20px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
  .content { overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

  /* ── Search bar ── */
  .search-row { display: flex; gap: 8px; flex: 1; min-width: 260px; }
  .search-row input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .15s; }
  .search-row input:focus { border-color: var(--accent); }
  .search-row input::placeholder { color: var(--muted); }
  button { background: var(--accent); color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; transition: opacity .15s; }
  button:hover { opacity: .85; }
  button.secondary { background: var(--border); color: var(--text); }

  /* ── Stats cards ── */
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .stat-card { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
  .stat-card .num { font-size: 22px; font-weight: 700; color: var(--accent); }
  .stat-card .lbl { font-size: 11px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: .05em; }

  /* ── Filter section ── */
  .filter-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
  .filter-pills { display: flex; flex-direction: column; gap: 4px; }
  .pill { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px; transition: all .15s; display: flex; justify-content: space-between; align-items: center; }
  .pill:hover { border-color: var(--accent); color: var(--accent); }
  .pill.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .pill .count { font-size: 11px; opacity: .7; }

  /* ── Results ── */
  .result-meta { color: var(--muted); font-size: 12px; }
  .result-meta b { color: var(--text); }

  .result-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: border-color .15s; }
  .result-card:hover { border-color: var(--accent); }
  .result-card.selected { border-color: var(--accent2); background: #1e1b2e; }
  .result-card .title { font-size: 14px; font-weight: 600; margin-bottom: 6px; line-height: 1.4; }
  .result-card .snippet { font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 8px; }
  .result-card .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
  .tag.case_law { background: #1e3a5f; color: #60a5fa; }
  .tag.legislation { background: #1a2e1a; color: var(--green); }
  .tag.juris { background: var(--border); color: var(--text); }
  .tag.date { background: transparent; color: var(--muted); }

  /* ── Detail panel ── */
  .detail-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
  .detail-panel h2 { font-size: 16px; font-weight: 700; margin-bottom: 12px; line-height: 1.4; }
  .detail-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .detail-body { color: var(--muted); font-size: 13px; line-height: 1.6; white-space: pre-wrap; font-family: ui-monospace, monospace; background: var(--bg); border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto; }
  .detail-link { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 13px; text-decoration: none; padding: 6px 12px; border: 1px solid var(--accent); border-radius: 6px; margin-top: 12px; }
  .detail-link:hover { background: var(--accent); color: #fff; }

  .empty { color: var(--muted); text-align: center; padding: 48px 0; font-size: 15px; }
  .error-msg { color: var(--red); font-size: 13px; }

  /* ── Highlight ── */
  b { color: var(--amber); font-weight: 700; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  @media (max-width: 700px) {
    .main { grid-template-columns: 1fr; }
    aside { display: none; }
  }
</style>
</head>
<body>
<div class="app">
  <header>
    <h1>AustLII <span>Legal Corpus</span></h1>
    <div class="search-row">
      <input id="q" type="search" placeholder="Search legislation and case law…" autocomplete="off">
      <button onclick="doSearch()">Search</button>
      <button class="secondary" onclick="clearSearch()">Clear</button>
    </div>
  </header>

  <div class="main">
    <aside id="sidebar">
      <!-- stats + filters injected by JS -->
    </aside>
    <div class="content" id="content">
      <div class="empty">Enter a search term or click a filter to browse the corpus.</div>
    </div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);

let state = { q: '', type: '', juris: '', limit: 50, selected: null };

// ── API calls ─────────────────────────────────────────────────────────────────

async function api(path) {
  const r = await fetch(path);
  return r.json();
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  const s = await api('/api/stats');
  renderSidebar(s);

  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar(s) {
  const jurisLabels = { cth:'Commonwealth', nsw:'New South Wales', vic:'Victoria', qld:'Queensland', sa:'South Australia', wa:'Western Australia', tas:'Tasmania', nt:'Northern Territory', act:'ACT' };

  $('sidebar').innerHTML = \`
    <div>
      <div class="stats-grid">
        <div class="stat-card"><div class="num">\${fmt(s.total)}</div><div class="lbl">Total docs</div></div>
        <div class="stat-card"><div class="num">\${fmt(s.case_law)}</div><div class="lbl">Case law</div></div>
        <div class="stat-card"><div class="num">\${fmt(s.legislation)}</div><div class="lbl">Legislation</div></div>
        <div class="stat-card"><div class="num">\${fmt(s.with_fulltext)}</div><div class="lbl">Full text</div></div>
      </div>
    </div>

    <div class="filter-section">
      <h3>Type</h3>
      <div class="filter-pills">
        <button class="pill \${!state.type ? 'active' : ''}" onclick="setFilter('type','')">All types</button>
        <button class="pill \${state.type==='case_law' ? 'active' : ''}" onclick="setFilter('type','case_law')">
          Case law <span class="count">\${fmt(s.case_law)}</span>
        </button>
        <button class="pill \${state.type==='legislation' ? 'active' : ''}" onclick="setFilter('type','legislation')">
          Legislation <span class="count">\${fmt(s.legislation)}</span>
        </button>
      </div>
    </div>

    <div class="filter-section">
      <h3>Jurisdiction</h3>
      <div class="filter-pills">
        <button class="pill \${!state.juris ? 'active' : ''}" onclick="setFilter('juris','')">All jurisdictions</button>
        \${s.by_jurisdiction.map(j => \`
          <button class="pill \${state.juris===j.jurisdiction ? 'active' : ''}" onclick="setFilter('juris','\${j.jurisdiction}')">
            \${jurisLabels[j.jurisdiction] || j.jurisdiction} <span class="count">\${fmt(j.n)}</span>
          </button>
        \`).join('')}
      </div>
    </div>
  \`;
}

// ── Search ────────────────────────────────────────────────────────────────────

function setFilter(key, val) {
  state[key === 'juris' ? 'juris' : 'type'] = val;
  doSearch();
}

function clearSearch() {
  state = { q: '', type: '', juris: '', limit: 50, selected: null };
  $('q').value = '';
  $('content').innerHTML = '<div class="empty">Enter a search term or click a filter to browse the corpus.</div>';
  boot(); // re-render sidebar without active state
}

async function doSearch() {
  state.q = $('q').value.trim();
  state.selected = null;

  // require at least a query OR a filter
  if (!state.q && !state.type && !state.juris) {
    $('content').innerHTML = '<div class="empty">Enter a search term or pick a filter.</div>';
    return;
  }

  $('content').innerHTML = '<div class="empty">Searching…</div>';

  let url = '/api/search?limit=' + state.limit;
  if (state.q)     url += '&q=' + encodeURIComponent(state.q);
  if (state.type)  url += '&type=' + state.type;
  if (state.juris) url += '&jurisdiction=' + state.juris;

  try {
    const data = await api(url);
    renderResults(data);
  } catch(e) {
    $('content').innerHTML = '<div class="error-msg">Search error: ' + e.message + '</div>';
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

const jurisShort = { cth:'CTH', nsw:'NSW', vic:'VIC', qld:'QLD', sa:'SA', wa:'WA', tas:'TAS', nt:'NT', act:'ACT' };

function renderResults(data) {
  if (!data.results?.length) {
    $('content').innerHTML = \`<div class="result-meta">No results\${state.q ? ' for <b>'+esc(state.q)+'</b>' : ''}.</div>\`;
    return;
  }

  const metaHtml = \`<div class="result-meta">Showing <b>\${data.results.length}</b> of <b>\${fmt(data.count ?? data.results.length)}</b> results\${state.q ? ' for <b>'+esc(state.q)+'</b>' : ''}</div>\`;

  const cards = data.results.map(r => \`
    <div class="result-card \${state.selected===r.id ? 'selected' : ''}" onclick="selectDoc(\${r.id}, this)">
      <div class="title">\${esc(r.title || '(untitled)')}</div>
      \${r.snippet ? '<div class="snippet">' + r.snippet + '</div>' : ''}
      <div class="tags">
        <span class="tag \${r.type}">\${r.type === 'case_law' ? 'Case Law' : 'Legislation'}</span>
        <span class="tag juris">\${jurisShort[r.jurisdiction] || r.jurisdiction}</span>
        \${r.pub_date ? '<span class="tag date">' + fmtDate(r.pub_date) + '</span>' : ''}
      </div>
    </div>
  \`).join('');

  $('content').innerHTML = metaHtml + cards;
}

// ── Document detail ───────────────────────────────────────────────────────────

async function selectDoc(id, el) {
  // deselect old
  document.querySelectorAll('.result-card.selected').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.selected = id;

  // remove old detail panel
  const old = document.getElementById('detail-panel');
  if (old) old.remove();

  const doc = await api('/api/document/' + id);

  const panel = document.createElement('div');
  panel.id = 'detail-panel';
  panel.className = 'detail-panel';
  panel.innerHTML = \`
    <h2>\${esc(doc.title || '(untitled)')}</h2>
    <div class="detail-meta">
      <span class="tag \${doc.type}">\${doc.type === 'case_law' ? 'Case Law' : 'Legislation'}</span>
      <span class="tag juris">\${jurisShort[doc.jurisdiction] || doc.jurisdiction}</span>
      \${doc.pub_date ? '<span class="tag date">' + fmtDate(doc.pub_date) + '</span>' : ''}
      \${doc.feed_code ? '<span class="tag date">' + esc(doc.feed_code) + '</span>' : ''}
    </div>
    \${doc.description ? '<div class="detail-body">' + esc(doc.description) + '</div>' : ''}
    \${doc.full_text   ? '<div class="detail-body">' + esc(doc.full_text.slice(0, 2000)) + (doc.full_text.length > 2000 ? '\\n\\n[truncated…]' : '') + '</div>' : ''}
    \${doc.url ? '<a class="detail-link" href="' + esc(doc.url) + '" target="_blank" rel="noopener">↗ Open on AustLII</a>' : ''}
  \`;

  el.insertAdjacentElement('afterend', panel);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) { return (n ?? 0).toLocaleString(); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.getFullYear();
}

boot();
</script>
</body>
</html>`;

// ─── HTTP server ─────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

const db = getDb();

const server = createServer((req, res) => {
  const url  = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === '/' || path === '/index.html') return html(res, HTML);

  if (path === '/api/stats') return json(res, stats());

  if (path === '/api/search') {
    const q          = url.searchParams.get('q') || '';
    const type       = url.searchParams.get('type') || '';
    const juris      = url.searchParams.get('jurisdiction') || '';
    const limit      = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    // If no query but filters given, do a browse (no FTS required)
    if (!q && (type || juris)) {
      let sql = 'SELECT id, title, url, pub_date, type, jurisdiction, feed_code FROM documents WHERE 1=1';
      const params = [];
      if (type)  { sql += ' AND type = ?';         params.push(type); }
      if (juris) { sql += ' AND jurisdiction = ?';  params.push(juris); }
      sql += ' ORDER BY title LIMIT ?';
      params.push(limit);
      const results = db.prepare(sql).all(...params);
      const countSql = sql.replace('SELECT id, title, url, pub_date, type, jurisdiction, feed_code', 'SELECT COUNT(*) AS n').replace(/ ORDER BY.*/, '');
      const count = db.prepare(countSql).get(...params.slice(0, -1))?.n ?? results.length;
      return json(res, { query: q, count, results });
    }

    if (!q) return json(res, { error: 'q param required when no filters set' }, 400);

    try {
      // FTS search
      let sql = `
        SELECT d.id, d.title, d.url, d.pub_date, d.type, d.jurisdiction, d.feed_code,
               snippet(documents_fts, 1, '<b>', '</b>', '…', 24) AS snippet
        FROM documents_fts f
        JOIN documents d ON d.id = f.rowid
        WHERE documents_fts MATCH ?
      `;
      const params = [q];
      if (type)  { sql += ' AND d.type = ?';         params.push(type); }
      if (juris) { sql += ' AND d.jurisdiction = ?';  params.push(juris); }
      sql += ' ORDER BY rank LIMIT ?';
      params.push(limit);

      const results = db.prepare(sql).all(...params);
      return json(res, { query: q, count: results.length, results });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  const docMatch = path.match(/^\/api\/document\/(\d+)$/);
  if (docMatch) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(parseInt(docMatch[1], 10));
    if (!doc) { res.writeHead(404); res.end(); return; }
    return json(res, doc);
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`AustLII Viewer → ${url}`);
  // Auto-open in Brave
  import('child_process').then(({ exec }) => exec(`open -a "Brave Browser" "${url}"`));
});
