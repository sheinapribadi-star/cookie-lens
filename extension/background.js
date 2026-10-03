// Cookie Lens service worker. Observes which hosts each tab talks to, when cookies appear,
// keeps local tallies, sets the badge, and performs deletions. No network calls, no remote code.
import { loadData, baseDomain } from './lib/data.js';
import { classify, cookieKey, readConsentRecord } from './lib/classify.js';

const LATE_MS = 1000;          // a cookie created this long after onCompleted counts as "after load"
const MAX_SEEN = 40000;        // cap on remembered cookie keys
const MAX_SEEN_ON = 80;        // cap on sites remembered per tracker domain

let db = null;                 // mirror of chrome.storage.local (settings, stats, seen, seenOn, sites)
let tabs = {};                 // per-tab state, mirrored to chrome.storage.session
let readyP = null;
const dirty = { local: false, session: false };
let flushTimer = null;

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const siteOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? baseDomain(u.hostname) : null; } catch { return null; } };

function ready() {
  if (!readyP) readyP = (async () => {
    await loadData();
    const l = await chrome.storage.local.get(['settings', 'stats', 'seen', 'seenOn', 'sites']);
    db = {
      settings: { allowlist: [], autoClean: false, ...(l.settings || {}) },
      stats: l.stats || { since: Date.now(), days: {}, totals: { seen: 0, trackers: 0, deleted: 0 } },
      seen: l.seen || {}, seenOn: l.seenOn || {}, sites: l.sites || {},
    };
    if (!l.settings) { db.settings.installedAt = Date.now(); dirty.local = true; }
    const s = await chrome.storage.session.get('tabs');
    tabs = s.tabs || {};
  })();
  return readyP;
}

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(async () => {
    if (dirty.local) { dirty.local = false; await chrome.storage.local.set(db); }
    if (dirty.session) { dirty.session = false; await chrome.storage.session.set({ tabs }); }
  }, 500);
}
const touchLocal = () => { dirty.local = true; scheduleFlush(); };
const touchSession = () => { dirty.session = true; scheduleFlush(); };

function bump(field, n = 1) {
  const d = (db.stats.days[today()] ||= { seen: 0, trackers: 0, deleted: 0 });
  d[field] += n; db.stats.totals[field] += n; touchLocal();
}

function registerSeen(info) {
  if (db.seen[info.key]) return;
  db.seen[info.key] = [Date.now(), info.risk === 'tracker' ? 1 : 0, info.owner];
  bump('seen'); if (info.risk === 'tracker') bump('trackers');
  const keys = Object.keys(db.seen);
  if (keys.length > MAX_SEEN) for (const k of keys.slice(0, keys.length - MAX_SEEN)) delete db.seen[k];
}

function newTabState(url) {
  return { url, site: siteOf(url), hosts: {}, start: Date.now(), loadedAt: null, late: [], early: [], partial: false };
}

// ---------- cookie collection for a tab ----------
async function collect(t) {
  if (!t?.site) return { list: [], raw: [] };
  const urls = new Set([t.url]);
  const pageHost = new URL(t.url).hostname;
  for (const h of Object.keys(t.hosts)) if (h !== pageHost) urls.add(`https://${h}/`);
  const found = new Map();
  await Promise.all([...urls].map(async (url) => {
    try { for (const c of await chrome.cookies.getAll({ url })) found.set(cookieKey(c), c); } catch {}
  }));
  // CHIPS: partitioned third-party cookies keyed to this top-level site
  try {
    const topLevelSite = `https://${t.site}`;
    for (const c of await chrome.cookies.getAll({ partitionKey: { topLevelSite } })) if (c.partitionKey) found.set(cookieKey(c), c);
  } catch {}
  const raw = [...found.values()];
  const list = raw.map((c) => classify(c, t.site));
  const now = Date.now();
  for (const info of list) {
    registerSeen(info);
    if (info.third) {
      const m = (db.seenOn[info.owner] ||= {}); m[t.site] = now;
      const ks = Object.keys(m); if (ks.length > MAX_SEEN_ON) delete m[ks.sort((a, b) => m[a] - m[b])[0]];
      touchLocal();
    }
  }
  return { list, raw };
}

// ---------- badge ----------
const badgeTimers = {};
function scheduleBadge(tabId) {
  clearTimeout(badgeTimers[tabId]);
  badgeTimers[tabId] = setTimeout(() => updateBadge(tabId), 400);
}
async function updateBadge(tabId) {
  await ready();
  const t = tabs[tabId];
  const { list } = await collect(t);
  const n = list.filter((c) => c.risk === 'tracker').length;
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#B3361B' });
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#F4F1EA' });
    await chrome.action.setBadgeText({ tabId, text: n ? String(n > 999 ? '999+' : n) : '' });
    await chrome.action.setTitle({ tabId, title: t?.site ? `Cookie Lens — ${list.length} cookies, ${n} trackers on ${t.site}` : 'Cookie Lens' });
  } catch {} // tab may be gone
}

// ---------- listeners (registered synchronously at top level, as MV3 requires) ----------
chrome.webRequest.onBeforeRequest.addListener((d) => {
  if (d.tabId < 0) return;
  ready().then(() => {
    if (d.type === 'main_frame') tabs[d.tabId] = newTabState(d.url);
    else {
      const t = tabs[d.tabId]; if (!t) return;
      try { const h = new URL(d.url).hostname; if (!t.hosts[h]) { t.hosts[h] = 1; touchSession(); } } catch {}
    }
    touchSession(); scheduleBadge(d.tabId);
  });
}, { urls: ['<all_urls>'] });

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  ready().then(() => {
    const t = tabs[d.tabId];
    if (!t || siteOf(t.url) !== siteOf(d.url)) tabs[d.tabId] = { ...newTabState(d.url), hosts: t?.hosts || {} };
    else t.url = d.url;
    touchSession(); scheduleBadge(d.tabId);
  });
});

chrome.webNavigation.onCompleted.addListener((d) => {
  if (d.frameId !== 0) return;
  ready().then(() => {
    const t = tabs[d.tabId]; if (!t) return;
    t.loadedAt = Date.now();
    if (t.site) { const s = (db.sites[t.site] ||= { first: Date.now(), visits: 0, late: 0, early: 0 }); s.last = Date.now(); s.visits++; touchLocal(); }
    touchSession(); scheduleBadge(d.tabId);
  });
});

chrome.cookies.onChanged.addListener(({ cookie, removed, cause }) => {
  if (removed) return;
  ready().then(() => {
    const host = cookie.domain.replace(/^\./, '');
    const owner = baseDomain(host);
    const now = Date.now();
    const related = Object.entries(tabs).filter(([, t]) => t.site && (t.site === owner ||
      Object.keys(t.hosts).some((h) => h === host || h.endsWith('.' + host))));
    const info = classify(cookie, related[0]?.[1].site || null);
    registerSeen(info);
    if (cause !== 'explicit' || !info.nonEssential) { related.forEach(([id]) => scheduleBadge(+id)); return; }
    for (const [id, t] of related) {
      const tinfo = t.site === related[0][1].site ? info : classify(cookie, t.site);
      if (!tinfo.nonEssential) continue;
      const bucket = t.loadedAt && now - t.loadedAt > LATE_MS ? 'late' : 'early';
      if (!t[bucket].includes(info.key)) {
        t[bucket].push(info.key);
        const s = (db.sites[t.site] ||= { first: now, visits: 0, late: 0, early: 0 }); s[bucket] = (s[bucket] || 0) + 1;
        touchLocal(); touchSession();
      }
      scheduleBadge(+id);
    }
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => scheduleBadge(tabId));

chrome.tabs.onRemoved.addListener((tabId) => {
  ready().then(async () => {
    const t = tabs[tabId]; delete tabs[tabId]; touchSession();
    if (!db.settings.autoClean || !t?.site || db.settings.allowlist.includes(t.site)) return;
    // Leave trackers another open tab is still using; they'd only be re-set (and could break that tab).
    const others = Object.values(tabs);
    const inUse = (c) => others.some((x) => x.site === c.owner || Object.keys(x.hosts).some((h) => h === c.host || h.endsWith('.' + c.host)));
    // Wait a moment: pages fire unload beacons whose responses can still set cookies after the tab is gone.
    await new Promise((r) => setTimeout(r, 1500));
    const { list } = await collect(t);
    const victims = list.filter((c) => c.risk === 'tracker' && !inUse(c) && !db.settings.allowlist.includes(c.owner));
    if (victims.length) await removeCookies(victims);
  });
});

// Seed state for tabs that were already open when the worker (re)started.
chrome.runtime.onInstalled.addListener(seedTabs);
chrome.runtime.onStartup.addListener(seedTabs);
async function seedTabs() {
  await ready();
  for (const tab of await chrome.tabs.query({})) {
    if (!tab.url || tabs[tab.id]) continue;
    tabs[tab.id] = { ...newTabState(tab.url), loadedAt: Date.now(), partial: true };
    scheduleBadge(tab.id);
  }
  touchSession();
}

// ---------- deletion ----------
async function removeCookies(cookies) {
  let n = 0;
  await Promise.all(cookies.map(async (c) => {
    const url = `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`;
    const details = { url, name: c.name, storeId: c.storeId };
    if (c.partitionKey) details.partitionKey = c.partitionKey;
    try { if (await chrome.cookies.remove(details)) n++; } catch {}
  }));
  if (n) bump('deleted', n);
  return n;
}

// ---------- messages from popup / dashboard ----------
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    await ready();
    switch (msg.type) {
      case 'report': {
        let t = tabs[msg.tabId];
        if (!t && msg.url) { t = tabs[msg.tabId] = { ...newTabState(msg.url), loadedAt: Date.now(), partial: true }; touchSession(); }
        const { list, raw } = await collect(t);
        const firstParty = raw.filter((c) => baseDomain(c.domain) === t?.site);
        return {
          site: t?.site || null, url: t?.url || msg.url, partial: !!t?.partial, loadedAt: t?.loadedAt || null,
          hostsContacted: t ? Object.keys(t.hosts).length : 0,
          cookies: list, consent: readConsentRecord(firstParty),
          late: t?.late || [], early: t?.early || [],
          allowlisted: !!t?.site && db.settings.allowlist.includes(t.site),
        };
      }
      case 'delete': {
        const n = await removeCookies(msg.cookies);
        if (msg.tabId != null) scheduleBadge(msg.tabId);
        return { deleted: n };
      }
      case 'state': return { settings: db.settings, stats: db.stats, seenOn: db.seenOn, sites: db.sites, seenCount: Object.keys(db.seen).length };
      case 'setSettings': {
        Object.assign(db.settings, msg.settings); touchLocal();
        return { settings: db.settings };
      }
      case 'resetStats': {
        db.stats = { since: Date.now(), days: {}, totals: { seen: 0, trackers: 0, deleted: 0 } };
        db.seen = {}; db.seenOn = {}; db.sites = {}; touchLocal();
        return { ok: true };
      }
    }
  })().then(reply, (e) => reply({ error: String(e) }));
  return true;
});
