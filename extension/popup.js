import { icon, glyph, esc } from './lib/icons.js';
import { CATEGORY_LABEL, RISK_ORDER } from './lib/classify.js';

const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
const CATS = ['marketing', 'analytics', 'functional', 'necessary', 'unlisted'];
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
let tabId, report, filter = 'all', settings;

$('#wordmark').innerHTML = `${icon.lens(15)}Cookie Lens`;

async function activeTab() {
  const q = new URLSearchParams(location.search); // ?tabId= lets tests and the dashboard open a specific tab's report
  if (q.has('tabId')) return chrome.tabs.get(+q.get('tabId'));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function load() {
  const tab = await activeTab();
  tabId = tab?.id;
  [report, { settings }] = await Promise.all([send({ type: 'report', tabId, url: tab?.url }), send({ type: 'state' })]);
  render();
}

function render() {
  const main = $('#main');
  const site = report.site;
  $('#site').textContent = site || '—'; $('#site').title = report.url || '';
  $('#keep').checked = report.allowlisted; $('#keep').disabled = !site;
  if (!site) {
    $('#foot').hidden = true;
    main.innerHTML = `<div class="empty"><h2>Nothing to read here.</h2><p>Chrome doesn’t let extensions see cookies on its own pages, the Web Store or local files. Open a website and try again.</p></div>`;
    return;
  }
  const all = report.cookies;
  if (!all.length) {
    $('#foot').hidden = true;
    main.innerHTML = `<div class="empty"><h2>No cookies.</h2><p>${esc(site)} hasn’t set any cookies, and none of the services it loaded have either.${report.partial ? ' Reload the page so Cookie Lens can see which third parties it contacts.' : ''}</p></div>`;
    return;
  }
  const trackers = all.filter((c) => c.risk === 'tracker');
  const third = all.filter((c) => c.third);
  const thirdOwners = new Set(third.map((c) => c.owner));
  const counts = Object.fromEntries(CATS.map((k) => [k, all.filter((c) => c.category === k).length]));
  // Only count cookies that are still in this list, so the note never disagrees with the number above it.
  const present = new Set(all.map((c) => c.key));
  const early = report.early.filter((k) => present.has(k)).length, late = report.late.filter((k) => present.has(k)).length;

  main.innerHTML = `
    <section class="hero" aria-label="Summary">
      <div class="big">${all.length}</div>
      <div class="what">
        <div>${all.length === 1 ? 'cookie' : 'cookies'} on <b>${esc(site)}</b></div>
        ${trackers.length
          ? `<div class="trk">${glyph('tracker', false)}${plural(trackers.length, 'tracker')}</div>`
          : `<div class="trk none">${glyph('fine', false)}No known trackers</div>`}
      </div>
    </section>
    <section class="breakdown" aria-label="Breakdown by category">
      <div class="catbar" role="img" aria-label="${CATS.filter((k) => counts[k]).map((k) => `${counts[k]} ${CATEGORY_LABEL[k]}`).join(', ')}">
        ${CATS.filter((k) => counts[k]).map((k) => `<span class="cat--${k}" style="flex:${counts[k]}"></span>`).join('')}
      </div>
      <ul class="legend">${CATS.filter((k) => counts[k]).map((k) => `<li><span class="swatch cat--${k}"></span>${CATEGORY_LABEL[k]}<b>${counts[k]}</b></li>`).join('')}</ul>
      <p class="party"><span class="num">${all.length - third.length}</span> set by <span class="mono">${esc(site)}</span>${third.length ? ` · <span class="num">${third.length}</span> by ${plural(thirdOwners.size, 'other domain')}` : ' · none from third parties'}.</p>
    </section>
    ${early || late || report.consent || report.partial ? `<section class="note" aria-label="Consent signals">
      ${early || late ? `<p>Of these, <strong>${plural(early + late, 'non-essential cookie')}</strong> appeared while this tab was open${late ? `: ${early} before the page finished loading, <strong>${late} after</strong>. Cookies arriving after load are often what clicking “Accept” looks like, though lazy-loaded ads do it too.` : `, all before the page finished loading, so before you could answer any banner.`}</p>` : ''}
      ${report.consent ? `<p>${esc(report.consent.text)} <span class="q">(${esc(report.consent.cookie)})</span> That’s the site’s own record; it can reflect a default rather than a choice you made.</p>` : ''}
      ${report.partial ? `<p>This tab was open before Cookie Lens started. Reload it to see third-party cookies too.</p>` : ''}
    </section>` : ''}
    <section class="list" aria-label="Cookies">
      <div class="list-head">
        <span class="label">By domain</span>
        <div class="filters" role="group" aria-label="Filter">
          ${['all', 'tracker', 'watch', 'fine'].map((f) => `<button data-f="${f}" aria-pressed="${filter === f}">${{ all: 'All', tracker: 'Trackers', watch: 'Watch', fine: 'Fine' }[f]}</button>`).join('')}
        </div>
      </div>
      <div id="groups"></div>
    </section>`;
  renderGroups();
  main.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; main.querySelectorAll('.filters button').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderGroups(); }));

  // Kept domains are skipped. On a kept site, its own cookies stay; third-party trackers still go.
  const deletableTrackers = trackers.filter((c) => !settings.allowlist.includes(c.owner));
  $('#foot').hidden = false;
  const ct = $('#clearTrackers');
  ct.innerHTML = `${icon.broom(14)}${deletableTrackers.length ? `Clear ${plural(deletableTrackers.length, 'tracker')}` : trackers.length ? 'Trackers kept' : 'No trackers'}`;
  ct.disabled = !deletableTrackers.length;
  ct.onclick = () => remove(deletableTrackers, `Cleared ${plural(deletableTrackers.length, 'tracker')}.`);
  $('#clearAll').onclick = () => {
    if (report.allowlisted && !confirm(`${site} is on your keep list. Clear its cookies anyway? You may be signed out.`)) return;
    remove(all, `Cleared ${plural(all.length, 'cookie')}. Some sites set new ones when you reload.`);
  };
}

function renderGroups() {
  const list = report.cookies.filter((c) => filter === 'all' || c.risk === filter);
  const groups = new Map();
  for (const c of list) { if (!groups.has(c.owner)) groups.set(c.owner, []); groups.get(c.owner).push(c); }
  const worst = (g) => Math.min(...g.map((c) => RISK_ORDER[c.risk]));
  const ordered = [...groups.entries()].sort((a, b) => (a[0] === report.site) - (b[0] === report.site) || worst(a[1]) - worst(b[1]) || b[1].length - a[1].length);
  const el = $('#groups');
  if (!ordered.length) { el.innerHTML = `<div class="empty" style="padding:20px 16px"><p>No ${filter === 'tracker' ? 'trackers' : filter === 'watch' ? 'cookies to watch' : 'cookies in this group'} on this page.</p></div>`; return; }
  el.innerHTML = ordered.map(([owner, cs]) => {
    cs.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.name.localeCompare(b.name));
    const co = cs.find((c) => c.company)?.company;
    return `<div class="group">
      <div class="ghead"><span class="dom">${esc(owner)}</span><span class="co">${co && co.toLowerCase() !== owner.split('.')[0] ? esc(co) : ''}</span>${owner === report.site ? '<span class="tag">This site</span>' : '<span class="tag">3rd party</span>'}</div>
      ${cs.map(row).join('')}
    </div>`;
  }).join('');
  el.querySelectorAll('.row .main').forEach((b) => b.addEventListener('click', () => toggle(b)));
  el.querySelectorAll('.row .iconbtn').forEach((b) => b.addEventListener('click', () => {
    const c = report.cookies.find((x) => x.key === b.dataset.key);
    remove([c], `Deleted ${c.name}.`, b.closest('.row'));
  }));
}

function row(c) {
  return `<div class="row" data-key="${esc(c.key)}">
    <button class="main" aria-expanded="false" aria-label="${esc(`${c.name}, ${c.risk}. ${c.summary}`)}">
      ${glyph(c.risk)}<span class="name">${esc(c.name)}<span class="life">${esc(c.lifeShort)}</span></span>
      <span class="why">${esc(c.summary)}</span>
    </button>
    <button class="iconbtn" data-key="${esc(c.key)}" title="Delete this cookie" aria-label="Delete ${esc(c.name)}">${icon.trash(14)}</button>
  </div>`;
}

function toggle(btn) {
  const r = btn.closest('.row'); const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', !open);
  r.querySelector('.detail')?.remove();
  if (open) return;
  const c = report.cookies.find((x) => x.key === r.dataset.key);
  const exp = c.session ? 'End of session' : new Date(c.expirationDate * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  r.insertAdjacentHTML('beforeend', `<dl class="detail">
    <dt>Domain</dt><dd>${esc(c.domain)}${c.hostOnly ? ' (host only)' : ''}</dd>
    <dt>Path</dt><dd>${esc(c.path)}</dd>
    <dt>Expires</dt><dd>${esc(exp)}</dd>
    <dt>Flags</dt><dd>${[c.secure ? 'Secure' : 'not Secure', c.httpOnly ? 'HttpOnly' : 'readable by scripts', `SameSite=${c.sameSite}`, c.partitioned ? 'Partitioned' : ''].filter(Boolean).join(' · ')}</dd>
    <dt>Category</dt><dd>${CATEGORY_LABEL[c.category]}${c.platform ? ` · ${esc(c.platform)}` : ''}</dd>
    <ul class="reasons">${c.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </dl>`);
}

async function remove(cookies, message, rowEl) {
  if (!cookies.length) return;
  const { deleted } = await send({ type: 'delete', tabId, cookies });
  if (rowEl) rowEl.classList.add('gone');
  toast(deleted === cookies.length ? message : `Deleted ${deleted} of ${cookies.length}. Chrome refused the rest.`);
  setTimeout(load, rowEl ? 500 : 250);
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', role: 'status', textContent: text });
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

$('#keep').addEventListener('change', async (e) => {
  const list = new Set(settings.allowlist);
  e.target.checked ? list.add(report.site) : list.delete(report.site);
  ({ settings } = await send({ type: 'setSettings', settings: { allowlist: [...list] } }));
  report.allowlisted = e.target.checked;
  toast(e.target.checked ? `Keeping ${report.site}. Auto-clean will skip it.` : `${report.site} removed from your keep list.`);
});
$('#dash').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }); window.close(); });

load();
