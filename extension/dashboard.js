import { loadData, trackerInfo } from './lib/data.js';
import { classify, cookieKey, CATEGORY_LABEL, RISK_ORDER } from './lib/classify.js';
import { icon, glyph, esc } from './lib/icons.js';

const $ = (s, el = document) => el.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
const CATS = ['marketing', 'analytics', 'functional', 'necessary', 'unlisted'];
const fmt = new Intl.NumberFormat();
const plural = (n, one, many = one + 's') => `${fmt.format(n)} ${n === 1 ? one : many}`;
const dateFmt = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

let state, groups = [], byKey = new Map();
const view = { q: '', chip: 'all', sort: 'trackers', dir: -1, open: new Set(), sel: new Set() };

$('#wordmark').innerHTML = `${icon.lens(18)}Cookie Lens`;
document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon[el.dataset.icon](14); });

async function load() {
  await loadData();
  state = await send({ type: 'state' });
  let raw = await chrome.cookies.getAll({});
  try { // partitioned (CHIPS) cookies across all partitions
    const parts = await chrome.cookies.getAll({ partitionKey: {} });
    const m = new Map(raw.map((c) => [cookieKey(c), c]));
    for (const c of parts) m.set(cookieKey(c), c);
    raw = [...m.values()];
  } catch {}
  const visited = state.sites;
  const map = new Map(); byKey = new Map();
  for (const c of raw) {
    // Judge a cookie as first-party only if you've actually visited its site; otherwise it lives here as a third party.
    const tmp = classify(c, null);
    const info = visited[tmp.owner] ? classify(c, tmp.owner) : tmp;
    byKey.set(info.key, info);
    if (!map.has(info.owner)) map.set(info.owner, { owner: info.owner, cookies: [], company: '' });
    const g = map.get(info.owner); g.cookies.push(info); g.company ||= info.company;
  }
  groups = [...map.values()].map((g) => ({
    ...g,
    count: g.cookies.length,
    trackers: g.cookies.filter((c) => c.risk === 'tracker').length,
    watch: g.cookies.filter((c) => c.risk === 'watch').length,
    cats: Object.fromEntries(CATS.map((k) => [k, g.cookies.filter((c) => c.category === k).length])),
    seenOn: Object.keys(state.seenOn[g.owner] || {}).length,
    longest: Math.max(0, ...g.cookies.map((c) => c.lifeDays || 0)),
    kept: state.settings.allowlist.includes(g.owner),
    company: g.company || trackerInfo(g.owner)?.company || '',
  }));
  renderAll();
}

function renderAll() { renderIntro(); renderLedger(); renderFollow(); renderAfter(); renderChips(); renderTable(); renderSettings(); }

function renderIntro() {
  const total = groups.reduce((a, g) => a + g.count, 0), trk = groups.reduce((a, g) => a + g.trackers, 0);
  const since = state.settings.installedAt || state.stats.since;
  $('#lede').innerHTML = `<b>${plural(total, 'cookie')}</b> from <b>${plural(groups.length, 'domain')}</b> are stored in this Chrome profile right now, and <b>${fmt.format(trk)}</b> of them look like trackers. The running totals below start on ${dateFmt(since)}, when Cookie Lens was installed.`;
}

function spark(field, cls) {
  const days = []; const d = new Date();
  for (let i = 29; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); days.push(x.toLocaleDateString('en-CA')); }
  const vals = days.map((k) => state.stats.days[k]?.[field] || 0);
  const max = Math.max(1, ...vals); const W = 300, H = 40, bw = W / 30;
  const bars = vals.map((v, i) => v ? `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - 1 - (v / max) * (H - 4)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${((v / max) * (H - 4)).toFixed(1)}" class="${i === 29 ? 'today' : ''}"><title>${days[i]}: ${v}</title></rect>` : '').join('');
  return `<svg class="spark ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Last 30 days, max ${max} per day"><line x1="0" x2="${W}" y1="${H - .5}" y2="${H - .5}"/>${bars}</svg>
    <div class="spark-axis"><span>${sinceLabel(days[0])}</span><span>today</span></div>`;
}

function sinceLabel(first) {
  const since = new Date(state.stats.since || Date.now()).toLocaleDateString('en-CA');
  const md = (k) => new Date(k + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return since > first ? `History starts ${md(since)}` : md(first);
}

function renderLedger() {
  const t = state.stats.totals;
  const figs = [
    ['Cookies seen', t.seen, 'Distinct cookies Cookie Lens has observed', 'seen', ''],
    ['Trackers seen', t.trackers, 'Of those, labelled tracker when first seen', 'trackers', 'stamp'],
    ['Cookies deleted', t.deleted, 'By you, through Cookie Lens or auto-clean', 'deleted', ''],
  ];
  $('#ledger').innerHTML = figs.map(([label, n, sub, f, cls]) => `<div class="fig"><span class="label">${label}</span><div class="n ${cls}">${fmt.format(n)}</div><div class="sub">${sub}</div>${spark(f, cls)}</div>`).join('');
}

function renderFollow() {
  const rows = Object.entries(state.seenOn).map(([owner, sites]) => {
    const g = groups.find((x) => x.owner === owner);
    const ti = trackerInfo(owner);
    const isTracker = g ? g.trackers > 0 : !!ti && ['advertising', 'social', 'fingerprinting', 'cryptomining'].includes(ti.kind);
    return { owner, n: Object.keys(sites).length, sites: Object.keys(sites), company: g?.company || ti?.company || '', isTracker };
  }).sort((a, b) => b.n - a.n || b.isTracker - a.isTracker).slice(0, 9);
  const max = Math.max(1, ...rows.map((r) => r.n));
  $('#follow').innerHTML = rows.length ? rows.map((r) => `<li title="Seen on: ${esc(r.sites.join(', '))}">
      <span class="who"><span class="mono">${esc(r.owner)}</span><small>${esc(r.company) || '&nbsp;'}</small></span>
      <span class="track"><span class="fill ${r.isTracker ? '' : 'watch'}" style="width:${(r.n / max) * 100}%"></span></span>
      <span class="v">${r.n}</span></li>`).join('')
    : `<li class="empty-line" style="display:block">Nothing yet. Browse a few sites and the third parties that set cookies on more than one of them will line up here.</li>`;
}

function renderAfter() {
  const rows = Object.entries(state.sites).filter(([, s]) => (s.early || 0) + (s.late || 0) > 0)
    .sort((a, b) => (b[1].late || 0) - (a[1].late || 0) || (b[1].early || 0) - (a[1].early || 0)).slice(0, 8);
  $('#after').innerHTML = rows.length
    ? `<thead><tr><th>Site</th><th>Before load</th><th>After load</th><th>Visits</th></tr></thead><tbody>${rows.map(([site, s]) => `<tr><td>${esc(site)}</td><td>${s.early || 0}</td><td class="${s.late ? 'late' : ''}">${s.late || 0}</td><td>${s.visits || 0}</td></tr>`).join('')}</tbody>`
    : `<tbody><tr><td class="empty-line" style="font-family:var(--sans)">No pages watched yet. Counts appear for sites you load while Cookie Lens is running.</td></tr></tbody>`;
}

const CHIPS = [
  ['all', 'All', () => true], ['trackers', 'Has trackers', (g) => g.trackers > 0], ['analytics', 'Analytics', (g) => g.cats.analytics > 0],
  ['unlisted', 'Unlisted', (g) => g.cats.unlisted > 0], ['kept', 'Kept', (g) => g.kept],
];
function renderChips() {
  $('#chips').innerHTML = CHIPS.map(([k, l, f]) => `<button data-chip="${k}" aria-pressed="${view.chip === k}">${l}<span class="ct">${groups.filter(f).length}</span></button>`).join('');
  $('#chips').querySelectorAll('button').forEach((b) => b.onclick = () => { view.chip = b.dataset.chip; renderChips(); renderTable(); });
}

function visible() {
  const q = view.q.trim().toLowerCase(); const f = CHIPS.find((c) => c[0] === view.chip)[2];
  return groups.filter(f).filter((g) => !q || g.owner.includes(q) || g.company.toLowerCase().includes(q) || g.cookies.some((c) => c.name.toLowerCase().includes(q)))
    .sort((a, b) => {
      const k = view.sort; const r = k === 'owner' ? a.owner.localeCompare(b.owner) : (a[k] - b[k]);
      return (r || (b.count - a.count)) * (k === 'owner' ? -view.dir : view.dir);
    });
}

function mix(g) {
  return `<div class="catbar" role="img" aria-label="${CATS.filter((k) => g.cats[k]).map((k) => `${g.cats[k]} ${CATEGORY_LABEL[k]}`).join(', ')}">${CATS.filter((k) => g.cats[k]).map((k) => `<span class="cat--${k}" style="flex:${g.cats[k]}"></span>`).join('')}</div>`;
}
const lifeText = (days) => !days ? 'session' : days < 1 ? '<1 d' : days < 60 ? `${Math.round(days)} d` : days < 730 ? `${Math.round(days / 30.44)} mo` : `${Math.round(days / 365.25)} yr`;

function renderTable() {
  const rows = visible();
  document.querySelectorAll('.jar th').forEach((th) => { const b = $('button', th); if (!b) return; if (b.dataset.sort === view.sort) th.setAttribute('aria-sort', view.dir < 0 ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort'); });
  $('#jarCount').textContent = `${plural(rows.length, 'domain')} shown`;
  $('#rows').innerHTML = rows.length ? rows.map((g) => {
    const open = view.open.has(g.owner);
    return `<tr class="dom ${open ? 'open' : ''}" data-owner="${esc(g.owner)}">
      <td class="c-check"><input type="checkbox" class="sel" aria-label="Select ${esc(g.owner)}" ${view.sel.has(g.owner) ? 'checked' : ''}></td>
      <td><span class="dn">${esc(g.owner)}</span>${g.kept ? '<span class="kept">Kept</span>' : ''}${g.company ? `<span class="co">${esc(g.company)}</span>` : ''}</td>
      <td class="c-num">${g.count}</td>
      <td class="c-num ${g.trackers ? 't' : 'zero'}">${g.trackers}</td>
      <td class="c-mix">${mix(g)}</td>
      <td class="c-num ${g.seenOn ? '' : 'zero'}">${g.seenOn ? plural(g.seenOn, 'site') : '—'}</td>
      <td class="c-num">${lifeText(g.longest)}</td>
      <td class="c-x"><button class="iconbtn exp" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} cookies from ${esc(g.owner)}"><span class="expander">${icon.chevron(14)}</span></button></td>
    </tr>${open ? kids(g) : ''}`;
  }).join('') : `<tr><td colspan="8" class="empty-line">${groups.length ? 'No domains match. Try a shorter search or another filter.' : 'Your cookie jar is empty. Either this is a fresh profile or you just cleared everything.'}</td></tr>`;

  $('#rows').querySelectorAll('tr.dom').forEach((tr) => {
    const owner = tr.dataset.owner;
    $('.exp', tr).onclick = () => { view.open.has(owner) ? view.open.delete(owner) : view.open.add(owner); renderTable(); $(`tr.dom[data-owner="${CSS.escape(owner)}"] .exp`)?.focus(); };
    $('.sel', tr).onchange = (e) => { e.target.checked ? view.sel.add(owner) : view.sel.delete(owner); renderBulk(); };
  });
  $('#rows').querySelectorAll('button.cn').forEach((b) => b.onclick = () => openDrawer(byKey.get(b.dataset.key), b));
  renderBulk();
}

function kids(g) {
  const cs = [...g.cookies].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.name.localeCompare(b.name));
  const shown = cs.slice(0, 60);
  return `<tr class="kids"><td colspan="8"><table class="ck"><tbody>${shown.map((c) => `<tr>
      <td style="width:34%"><button class="cn" data-key="${esc(c.key)}">${glyph(c.risk)}${esc(c.name)}</button></td>
      <td class="sum">${esc(c.summary)}</td>
      <td class="meta">${CATEGORY_LABEL[c.category]} · ${esc(c.lifeShort)}</td></tr>`).join('')}</tbody></table>
      ${cs.length > shown.length ? `<div class="more">Showing 60 of ${cs.length}. Search by name to narrow it down.</div>` : ''}</td></tr>`;
}

function renderBulk() {
  const sel = groups.filter((g) => view.sel.has(g.owner));
  const n = sel.reduce((a, g) => a + g.count, 0), t = sel.reduce((a, g) => a + g.trackers, 0);
  $('#selCount').textContent = sel.length ? `${plural(sel.length, 'domain')} · ${plural(n, 'cookie')}` : '';
  $('#delSel').disabled = !sel.length; $('#delSel').textContent = sel.length ? `Delete ${plural(n, 'cookie')}` : 'Delete selected';
  $('#delSelTrk').disabled = !t; $('#delSelTrk').textContent = t ? `Delete ${plural(t, 'tracker')} only` : 'Delete trackers in selection';
  const vis = visible(); const all = $('#checkAll');
  all.checked = vis.length > 0 && vis.every((g) => view.sel.has(g.owner));
  all.indeterminate = !all.checked && vis.some((g) => view.sel.has(g.owner));
}

async function del(cookies, msg) {
  if (!cookies.length) return;
  const { deleted } = await send({ type: 'delete', cookies });
  toast(deleted === cookies.length ? msg : `Deleted ${deleted} of ${cookies.length}. Chrome refused the rest.`);
  view.sel.clear(); await load();
}

// ---------- drawer ----------
let lastFocus = null;
function openDrawer(c, from) {
  if (!c) return;
  lastFocus = from;
  const d = $('#drawer'); const sites = Object.keys(state.seenOn[c.owner] || {});
  const yes = (v) => v ? 'Yes' : '<span class="no">No</span>';
  const riskWord = { tracker: 'Tracker', watch: 'Worth watching', fine: 'Fine' }[c.risk];
  d.innerHTML = `
    <div class="dh"><span class="eyebrow">${glyph(c.risk, false)}<span>${riskWord}</span><span style="color:var(--ink-3)">· ${CATEGORY_LABEL[c.category]}</span></span>
      <button class="iconbtn" id="dClose" aria-label="Close details">${icon.close(16)}</button></div>
    <h2 id="dTitle">${esc(c.name)}</h2>
    <p class="lead">${esc(c.summary)}</p>
    <dl>
      <dt>Domain</dt><dd>${esc(c.domain)}${c.hostOnly ? ' <span style="color:var(--ink-3)">host only</span>' : ''}</dd>
      <dt>Path</dt><dd>${esc(c.path)}</dd>
      <dt>Owner</dt><dd>${esc(c.owner)}${c.company ? ` · ${esc(c.company)}` : ''}</dd>
      <dt>Expires</dt><dd>${c.session ? 'When the browser closes' : `${new Date(c.expirationDate * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} (${esc(c.lifeShort)})`}</dd>
      <dt>Secure</dt><dd>${yes(c.secure)}</dd>
      <dt>HttpOnly</dt><dd>${c.httpOnly ? 'Yes' : 'No, page scripts can read it'}</dd>
      <dt>SameSite</dt><dd>${esc(c.sameSite)}${c.sameSite === 'no_restriction' ? ' (sent on cross-site requests)' : ''}</dd>
      ${c.partitioned ? `<dt>Partitioned</dt><dd>${esc(c.partitionKey?.topLevelSite || 'yes')}</dd>` : ''}
      <dt>Category</dt><dd>${CATEGORY_LABEL[c.category]}${c.platform ? ` · ${esc(c.platform)}` : ''}${c.controller && c.controller !== c.platform ? ` (${esc(c.controller)})` : ''}${c.retention && !/various|unknown/i.test(c.retention) ? ` · typically ${esc(c.retention)}` : ''}</dd>
      <dt>Seen on</dt><dd>${sites.length ? esc(sites.slice(0, 12).join(', ')) + (sites.length > 12 ? ` +${sites.length - 12}` : '') : '—'}</dd>
    </dl>
    <h3>${c.risk === 'fine' ? 'Why it looks fine' : 'Why it’s flagged'}</h3>
    <ol>${c.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    <div class="dfoot">
      <button class="btn btn--stamp" id="dDel">${icon.trash(14)}Delete this cookie</button>
      <button class="btn btn--ghost" id="dDelAll">Delete all ${esc(c.owner)} cookies</button>
    </div>
    <p class="src">Category from the Open Cookie Database; tracker status from Disconnect’s list; everything else read from the cookie itself.</p>`;
  d.hidden = false; $('#scrim').hidden = false; d.focus();
  $('#dClose').onclick = closeDrawer;
  $('#dDel').onclick = () => { closeDrawer(); del([c], `Deleted ${c.name}.`); };
  $('#dDelAll').onclick = () => { const g = groups.find((x) => x.owner === c.owner); closeDrawer(); del(g.cookies, `Deleted ${plural(g.count, 'cookie')} from ${c.owner}.`); };
}
function closeDrawer() { $('#drawer').hidden = true; $('#scrim').hidden = true; lastFocus?.focus?.(); }
$('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', (e) => {
  const d = $('#drawer'); if (d.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
  if (e.key === 'Tab') {
    const f = [...d.querySelectorAll('button, a[href], input')]; if (!f.length) return;
    if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === d)) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }
});

// ---------- settings ----------
function renderSettings() {
  const s = state.settings;
  $('#autoClean').checked = !!s.autoClean;
  $('#keepList').innerHTML = s.allowlist.length ? s.allowlist.slice().sort().map((d) => `<li>${esc(d)}<button class="iconbtn" data-d="${esc(d)}" aria-label="Remove ${esc(d)} from keep list">${icon.close(12)}</button></li>`).join('') : '<li class="none">Empty. Nothing is protected from clean-up yet.</li>';
  $('#keepList').querySelectorAll('button').forEach((b) => b.onclick = () => saveKeep(s.allowlist.filter((x) => x !== b.dataset.d)));
  $('#export').innerHTML = `${icon.download(14)}Export history (JSON)`;
}
async function saveKeep(list) { ({ settings: state.settings } = await send({ type: 'setSettings', settings: { allowlist: list } })); groups.forEach((g) => g.kept = list.includes(g.owner)); renderSettings(); renderChips(); renderTable(); }
$('#keepForm').onsubmit = (e) => {
  e.preventDefault(); const v = $('#keepInput').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!v || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) { toast('That doesn’t look like a domain. Try something like example.com.'); return; }
  if (!state.settings.allowlist.includes(v)) saveKeep([...state.settings.allowlist, v]);
  $('#keepInput').value = '';
};
$('#autoClean').onchange = async (e) => { ({ settings: state.settings } = await send({ type: 'setSettings', settings: { autoClean: e.target.checked } })); toast(e.target.checked ? 'Auto-clean is on. Trackers go when their tab closes.' : 'Auto-clean is off.'); };
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), stats: state.stats, sites: state.sites, seenOn: state.seenOn, settings: state.settings }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `cookie-lens-${new Date().toLocaleDateString('en-CA')}.json` }); a.click(); URL.revokeObjectURL(a.href);
};
$('#reset').onclick = async () => { if (!confirm('Reset all counts and history? Your keep list and settings stay. Cookies in the browser are not touched.')) return; await send({ type: 'resetStats' }); toast('History cleared.'); load(); };

// ---------- table controls ----------
$('#q').addEventListener('input', (e) => { view.q = e.target.value; renderTable(); });
document.querySelectorAll('.jar th button').forEach((b) => b.onclick = () => { const k = b.dataset.sort; view.dir = view.sort === k ? -view.dir : -1; view.sort = k; renderTable(); });
$('#checkAll').onchange = (e) => { visible().forEach((g) => e.target.checked ? view.sel.add(g.owner) : view.sel.delete(g.owner)); renderTable(); };
$('#delSel').onclick = () => {
  const sel = groups.filter((g) => view.sel.has(g.owner)); const kept = sel.filter((g) => g.kept);
  if (kept.length && !confirm(`${kept.map((g) => g.owner).join(', ')} ${kept.length === 1 ? 'is' : 'are'} on your keep list. Delete anyway?`)) return;
  const cs = sel.flatMap((g) => g.cookies); del(cs, `Deleted ${plural(cs.length, 'cookie')} from ${plural(sel.length, 'domain')}.`);
};
$('#delSelTrk').onclick = () => { const cs = groups.filter((g) => view.sel.has(g.owner) && !g.kept).flatMap((g) => g.cookies.filter((c) => c.risk === 'tracker')); del(cs, `Deleted ${plural(cs.length, 'tracker')}.`); };

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', role: 'status', textContent: text });
  Object.assign(t.style, { position: 'fixed', left: '40px', bottom: '24px', background: 'var(--ink)', color: 'var(--paper)', padding: '10px 14px', fontSize: '13px', borderRadius: '3px', zIndex: 30 });
  document.body.append(t); setTimeout(() => t.remove(), 3000);
}

chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.stats && !document.hidden) { state.stats = ch.stats.newValue; renderLedger(); } });
load();
