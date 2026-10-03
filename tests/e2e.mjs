// End-to-end test: loads the unpacked extension in Chromium (new headless), browses real sites with trackers,
// checks detection/classification, badge, per-cookie + bulk deletion, auto-clean, and captures screenshots.
// Run: node tests/e2e.mjs
import { chromium } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const EXT = path.resolve('extension');
const SHOTS = path.resolve('screenshots');
const SITES = (process.env.SITES || 'https://www.cnn.com/,https://www.theverge.com/,https://www.bbc.com/news,https://www.allrecipes.com/').split(',');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookielens-'));
const results = []; const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const ctx = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1280, height: 860 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
ok('service worker loaded', !!extId, extId);

// A helper page inside the extension to call chrome.* APIs
const helper = await ctx.newPage();
await helper.goto(`chrome-extension://${extId}/dashboard.html`);
const api = (fn, arg) => helper.evaluate(fn, arg);
const tabIdFor = (url) => api(async (u) => (await chrome.tabs.query({})).filter((t) => t.url && t.url.startsWith(u)).at(-1)?.id, url);
const report = (tabId) => api((id) => chrome.runtime.sendMessage({ type: 'report', tabId: id }), tabId);

const perSite = [];
let best = null;
for (const url of SITES) {
  const page = await ctx.newPage();
  try { await page.goto(url, { waitUntil: 'load', timeout: 45000 }); } catch (e) { console.log('  load issue', url, e.message.split('\n')[0]); }
  await page.waitForTimeout(9000);
  // scroll a little so lazy trackers fire, like a person reading
  await page.mouse.wheel(0, 1800).catch(() => {}); await page.waitForTimeout(3000);
  const finalUrl = page.url();
  const tabId = await tabIdFor(finalUrl.split('#')[0].slice(0, 40));
  const r = tabId != null ? await report(tabId) : null;
  const badge = tabId != null ? await api((id) => chrome.action.getBadgeText({ tabId: id }), tabId) : '';
  if (r) {
    const trk = r.cookies.filter((c) => c.risk === 'tracker');
    const third = r.cookies.filter((c) => c.third);
    const cats = r.cookies.reduce((a, c) => (a[c.category] = (a[c.category] || 0) + 1, a), {});
    const row = { url: finalUrl, site: r.site, cookies: r.cookies.length, third: third.length, trackers: trk.length, badge, cats, early: r.early.length, late: r.late.length, consent: r.consent?.text || '', sample: trk.slice(0, 3).map((c) => `${c.name} — ${c.summary}`) };
    perSite.push(row); console.log(JSON.stringify(row, null, 1));
    if (!best || trk.length > best.trackers) best = { ...row, tabId, page };
    ok(`detects cookies on ${r.site}`, r.cookies.length > 0, `${r.cookies.length} cookies, ${third.length} third-party, ${trk.length} trackers`);
    ok(`badge matches tracker count on ${r.site}`, badge === (trk.length ? String(trk.length) : ''), `badge="${badge}"`);
  } else ok(`report for ${url}`, false, 'no tab state');
}
ok('at least one site has third-party trackers', !!best && best.trackers > 0, best ? `${best.site}: ${best.trackers}` : '');

// ---- Popup screenshots for the busiest site ----
const popup = await ctx.newPage();
await popup.setViewportSize({ width: 368, height: 600 });
await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${best.tabId}`);
await popup.waitForSelector('.hero'); await popup.waitForTimeout(400);
await popup.screenshot({ path: `${SHOTS}/popup.png` });
// expanded row
await popup.click('.row .main'); await popup.waitForTimeout(150);
await popup.screenshot({ path: `${SHOTS}/popup-expanded.png` });
await popup.click('.filters button[data-f="tracker"]'); await popup.waitForTimeout(150);
await popup.click('.row .main'); // collapse first row of new list (none open) -> opens; close again
await popup.click('.row .main');
await popup.screenshot({ path: `${SHOTS}/popup-trackers.png` });

// keyboard path: Tab reaches the filters and cookie rows; Enter expands a row
await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${best.tabId}`); await popup.waitForSelector('.hero');
let reached = false;
for (let i = 0; i < 12 && !reached; i++) { await popup.keyboard.press('Tab'); reached = await popup.evaluate(() => document.activeElement?.classList.contains('main')); }
if (reached) await popup.keyboard.press('Enter');
ok('popup rows reachable and expandable by keyboard', reached && await popup.locator('.row .detail').count() === 1);
await popup.screenshot({ path: `${SHOTS}/popup-keyboard.png` });

// ---- Delete one cookie through the popup ----
const before = await report(best.tabId);
const victim = before.cookies.find((c) => c.risk === 'tracker');
await popup.click(`.row .iconbtn[data-key="${victim.key.replace(/"/g, '\\"')}"]`);
await popup.waitForTimeout(800);
const still = await api(async (v) => {
  const all = await chrome.cookies.getAll({ name: v.name, domain: v.domain.replace(/^\./, '') });
  return all.filter((c) => c.domain === v.domain && c.path === v.path).length;
}, victim);
ok('per-cookie delete removes it from Chrome', still === 0, `${victim.name} @ ${victim.domain}`);

// ---- Dashboard screenshots ----
await api(() => chrome.runtime.sendMessage({ type: 'setSettings', settings: { allowlist: ['github.com', 'nytimes.com'] } }));
const dash = await ctx.newPage();
await dash.setViewportSize({ width: 1280, height: 900 });
await dash.goto(`chrome-extension://${extId}/dashboard.html`); await dash.waitForSelector('tr.dom'); await dash.waitForTimeout(500);
await dash.screenshot({ path: `${SHOTS}/dashboard.png` });
await dash.screenshot({ path: `${SHOTS}/dashboard-full.png`, fullPage: true });
await dash.click('#chips button[data-chip="trackers"]');
await dash.click('th button[data-sort="seenOn"]');
await dash.click('tr.dom .exp'); await dash.waitForTimeout(200);
await dash.locator('#jar').scrollIntoViewIfNeeded();
await dash.evaluate(() => document.querySelector('#jar').scrollIntoView());
await dash.screenshot({ path: `${SHOTS}/dashboard-table.png` });
await dash.click('button.cn'); await dash.waitForTimeout(250);
await dash.screenshot({ path: `${SHOTS}/dashboard-drawer.png` });
// keyboard: Esc closes drawer
await dash.keyboard.press('Escape');
ok('drawer closes on Escape', await dash.locator('#drawer').isHidden());
// search
const firstOwner = await dash.locator('tr.dom .dn').first().textContent();
await dash.fill('#q', firstOwner); await dash.waitForTimeout(150);
const rows = await dash.locator('tr.dom').count();
ok('dashboard search filters the table', rows >= 1 && rows < 10, `${rows} rows for "${firstOwner}"`);

// ---- Clear all trackers for this site ----
await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${best.tabId}`); await popup.waitForSelector('.hero');
const trkBefore = (await report(best.tabId)).cookies.filter((c) => c.risk === 'tracker');
await popup.click('#clearTrackers'); await popup.waitForTimeout(300);
const remaining = await api(async (list) => {
  let n = 0; for (const v of list) { const all = await chrome.cookies.getAll({ name: v.name, domain: v.domain.replace(/^\./, '') }); n += all.filter((c) => c.domain === v.domain && c.path === v.path && !c.partitionKey === !v.partitionKey).length; } return n;
}, trkBefore);
ok('"Clear trackers" removes every tracker cookie it listed', remaining === 0, `${trkBefore.length} listed, ${remaining} left immediately after`);
await popup.waitForTimeout(700);
await popup.screenshot({ path: `${SHOTS}/popup-after-clear.png` });

// ---- Stats ----
const st = await api(() => chrome.runtime.sendMessage({ type: 'state' }));
ok('stats recorded in chrome.storage.local', st.stats.totals.seen > 0 && st.stats.totals.deleted > 0, JSON.stringify(st.stats.totals));

// ---- Auto-clean on tab close ----
// close the browsing tabs first so no other tab is still using the same trackers
for (const p of ctx.pages()) if (p !== helper && p !== popup) await p.close();
await api(() => chrome.runtime.sendMessage({ type: 'setSettings', settings: { autoClean: true } }));
const ac = await ctx.newPage();
const acUrl = process.env.AUTOCLEAN || 'https://www.bbc.com/news';
await ac.goto(acUrl, { waitUntil: 'load', timeout: 45000 }).catch(() => {}); await ac.waitForTimeout(9000);
const acTab = await tabIdFor(ac.url().slice(0, 40));
const acTrk = (await report(acTab)).cookies.filter((c) => c.risk === 'tracker');
// close every other page on that site so "open in another tab" doesn't protect them
for (const p of ctx.pages()) if (p !== ac && p !== helper && p !== popup && p.url().includes(new URL(acUrl).hostname.replace(/^www\./, ''))) await p.close();
await ac.close(); await helper.waitForTimeout(4500);
const acLeftList = await api(async (list) => {
  const left = []; for (const v of list) { const all = await chrome.cookies.getAll({ name: v.name, domain: v.domain.replace(/^\./, '') }); for (const c of all.filter((c) => c.domain === v.domain && c.path === v.path)) left.push(`${c.name}@${c.domain} exp=${c.expirationDate}`); } return left;
}, acTrk.filter((c) => c.owner !== new URL(acUrl).hostname.replace(/^www\./, '')));
const openSitesAtClose = await api(async () => Object.values((await chrome.storage.session.get('tabs')).tabs || {}).map((t) => t.site));
const acLeft = acLeftList.length;
ok('auto-clean deletes third-party trackers when the tab closes', acTrk.length > 0 && acLeft === 0, `${acTrk.length} trackers before close, ${acLeft} third-party trackers left ${acLeftList.join(', ')} | open sites: ${openSitesAtClose.join(',')}`);
await api(() => chrome.runtime.sendMessage({ type: 'setSettings', settings: { autoClean: false } }));

const dash2 = await ctx.newPage(); await dash2.setViewportSize({ width: 1280, height: 900 });
await dash2.goto(`chrome-extension://${extId}/dashboard.html`); await dash2.waitForSelector('.fig'); await dash2.waitForTimeout(400);
await dash2.screenshot({ path: `${SHOTS}/dashboard-after-cleanup.png` });

// ---- Empty-state popup on a chrome:// page ----
const blank = await ctx.newPage(); await blank.goto('chrome://version');
const blankId = await api(async () => (await chrome.tabs.query({})).find((t) => !t.url)?.id); // no url: Chrome hides chrome:// URLs from extensions
await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${blankId}`); await popup.waitForSelector('.empty');
await popup.setViewportSize({ width: 368, height: 260 });
await popup.screenshot({ path: `${SHOTS}/popup-empty.png` });

fs.writeFileSync(path.resolve('tests/last-run.json'), JSON.stringify({ when: new Date().toString(), perSite, results }, null, 2));
await ctx.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
