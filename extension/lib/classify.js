import { baseDomain, trackerInfo, ocdInfo } from './data.js';

export const RISK_ORDER = { tracker: 0, watch: 1, fine: 2 };
export const CATEGORY_LABEL = { marketing: 'Marketing', analytics: 'Analytics', functional: 'Functional', necessary: 'Necessary', unlisted: 'Unlisted' };
const KIND_PHRASE = {
  advertising: 'a known ad tracker', social: 'a social-media tracker', cryptomining: 'a known cryptominer',
  fingerprinting: 'a known fingerprinting script', analytics: 'an analytics tracker', email: 'an email tracker',
  antifraud: 'an anti-fraud service', consent: 'a consent manager', content: 'a content provider',
};
const NON_ESSENTIAL = new Set(['marketing', 'analytics']);

export function cookieKey(c) {
  return `${c.name}@${c.domain}${c.path}${c.partitionKey?.topLevelSite ? '|' + c.partitionKey.topLevelSite : ''}`;
}

/** Shannon entropy per char — used only in memory to decide "looks like a unique ID". */
function looksLikeId(value) {
  if (!value || value.length < 16) return false;
  const v = decodeSafe(value);
  if (/^(true|false|null|undefined|\d{1,10})$/i.test(v)) return false;
  const freq = {}; for (const ch of v) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0; for (const n of Object.values(freq)) { const p = n / v.length; h -= p * Math.log2(p); }
  return h >= 3.5;
}
function decodeSafe(v) { try { return decodeURIComponent(v); } catch { return v; } }

export function lifetime(cookie, now = Date.now()) {
  if (cookie.session || !cookie.expirationDate) return { days: 0, session: true, text: 'Deleted when you close the browser.' , short: 'session' };
  const ms = cookie.expirationDate * 1000 - now; const days = ms / 86400000;
  let short;
  if (days < 1) short = `${Math.max(1, Math.round(ms / 3600000))} h`;
  else if (days < 60) short = `${Math.round(days)} d`;
  else if (days < 730) short = `${Math.round(days / 30.44)} mo`;
  else short = `${Math.round(days / 365.25)} yr`;
  const long = short.replace(/ h$/, ' hours').replace(/ d$/, ' days').replace(/ mo$/, ' months').replace(/ yr$/, ' years')
    .replace(/^1 hours/, '1 hour').replace(/^1 days/, '1 day').replace(/^1 months/, '1 month').replace(/^1 years/, '1 year');
  return { days, session: false, text: `Lasts ${long}.`, short };
}

/**
 * Classify one cookie in the context of a site (registrable domain of the tab), or null for "seen as third-party".
 * Returns facts plus a plain-English summary; no hidden scores.
 */
export function classify(cookie, siteBase) {
  const host = cookie.domain.replace(/^\./, '');
  const owner = baseDomain(host);
  const third = siteBase ? owner !== siteBase : true;
  const tracker = trackerInfo(host);
  const ocd = ocdInfo(cookie.name, cookie.domain);
  const life = lifetime(cookie);
  const idLike = looksLikeId(cookie.value);

  let category = ocd?.category;
  if (!category && tracker && third) {
    category = { advertising: 'marketing', social: 'marketing', cryptomining: 'marketing', fingerprinting: 'marketing', analytics: 'analytics', email: 'marketing', consent: 'functional' }[tracker.kind];
  }
  category ||= 'unlisted';

  const trackerThird = third && tracker && ['advertising', 'social', 'cryptomining', 'fingerprinting'].includes(tracker.kind);
  const analyticsThird = third && tracker && ['analytics', 'email'].includes(tracker.kind);
  let risk = 'fine';
  if (trackerThird || category === 'marketing' || (third && idLike && life.days > 30 && !['necessary', 'functional'].includes(category))) risk = 'tracker';
  else if (category === 'analytics' || analyticsThird || (third && (idLike || (!life.session && category === 'unlisted')))) risk = 'watch';

  // Reasons — each is a fact we can point at.
  const reasons = [];
  const company = tracker?.company || ''; // owner per Disconnect; OCD controller kept separately
  if (third && tracker) reasons.push(`Set by ${host}, ${KIND_PHRASE[tracker.kind] || 'a listed tracker'}${tracker.company ? ` (${tracker.company})` : ''}.`);
  else if (third) reasons.push(`Set by ${host}, a third party on this page.`);
  else reasons.push(`Set by this site (${host}).`);
  if (ocd) reasons.push(`${ocd.platform} ${CATEGORY_LABEL[ocd.category].toLowerCase()} cookie${ocd.description ? ` — “${trimDesc(ocd.description)}”` : '.'}`);
  else if (!tracker) reasons.push('Not in the Open Cookie Database.');
  if (idLike && risk !== 'fine') reasons.push('Its value looks like a unique ID.');
  reasons.push(life.text);
  if (!life.session && life.days > 395) reasons.push('That is longer than the 13 months regulators usually expect.');
  if (!cookie.secure) reasons.push('Sent over unencrypted connections too (no Secure flag).');

  let primary;
  if (third && tracker) primary = reasons[0];
  else if (ocd) primary = `${ocd.platform}${ocd.description ? ` — ${trimDesc(ocd.description)}` : ` ${CATEGORY_LABEL[ocd.category].toLowerCase()} cookie.`}`;
  else if (third) primary = `Third-party cookie from ${host}; not in either list.`;
  else primary = 'Set by this site; not in the Open Cookie Database.';
  const summary = `${primary} ${life.text}`;
  return {
    key: cookieKey(cookie), name: cookie.name, domain: cookie.domain, host, path: cookie.path, owner, third,
    company, controller: ocd?.controller || '', platform: ocd?.platform || '', description: ocd?.description || '', retention: ocd?.retention || '',
    trackerKind: tracker?.kind || '', fingerprinting: !!tracker?.fingerprinting,
    category, risk, nonEssential: NON_ESSENTIAL.has(category) || risk === 'tracker', idLike,
    secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, session: life.session,
    expirationDate: cookie.expirationDate || null, lifeShort: life.short, lifeDays: life.days,
    partitioned: !!cookie.partitionKey, partitionKey: cookie.partitionKey || null, storeId: cookie.storeId,
    hostOnly: cookie.hostOnly, reasons, summary,
  };
}
function trimDesc(d) {
  d = d.replace(/\s+/g, ' ').trim();
  const first = (d.match(/^.+?[.!?](?=\s|$)/) || [d])[0].replace(/\s*\(e\.g$/, '');
  let out = first.length <= 120 ? first : first.slice(0, 117).replace(/[\s,;:(]+\S*$/, '') + '…';
  if (!/[.!?…]$/.test(out)) out += '.';
  return out;
}

/** Reads the site's own consent-record cookie when we know the format. Quoted, never guessed. */
export function readConsentRecord(cookies) {
  for (const c of cookies) {
    const v = decodeSafe(c.value || '');
    if (c.name === 'OptanonConsent') {
      const m = v.match(/groups=([^&]+)/);
      if (!m) return { cmp: 'OneTrust', cookie: c.name, text: 'OneTrust consent record present (no group choices stored yet).' };
      const names = { C0001: 'necessary', C0002: 'performance', C0003: 'functional', C0004: 'targeting', C0005: 'social' };
      const parts = m[1].split(',').map((g) => g.split(':')).filter(([k]) => names[k]);
      if (!parts.length) {
        const all = m[1].split(',').map((g) => g.split(':')).filter((g) => g.length === 2);
        const y = all.filter(([, x]) => x === '1').length, n = all.filter(([, x]) => x === '0').length;
        return { cmp: 'OneTrust', cookie: c.name, text: `OneTrust record lists ${all.length} consent groups: ${y} allowed, ${n} refused. This site uses its own group IDs, so Cookie Lens can’t name them.` };
      }
      const on = parts.filter(([, x]) => x === '1').map(([k]) => names[k]);
      const off = parts.filter(([, x]) => x === '0').map(([k]) => names[k]);
      return { cmp: 'OneTrust', cookie: c.name, on, off, text: `OneTrust record says: allowed ${on.join(', ') || 'nothing'}${off.length ? `; refused ${off.join(', ')}` : ''}.` };
    }
    if (c.name === 'CookieConsent' && /necessary:/.test(v)) {
      const flag = (k) => (v.match(new RegExp(`${k}:(true|false)`)) || [])[1];
      const keys = ['preferences', 'statistics', 'marketing'];
      const on = keys.filter((k) => flag(k) === 'true'); const off = keys.filter((k) => flag(k) === 'false');
      return { cmp: 'Cookiebot', cookie: c.name, on, off, text: `Cookiebot record says: allowed necessary${on.length ? ', ' + on.join(', ') : ''}${off.length ? `; refused ${off.join(', ')}` : ''}.` };
    }
  }
  const tcf = cookies.find((c) => c.name === 'euconsent-v2');
  if (tcf) return { cmp: 'IAB TCF', cookie: tcf.name, text: 'An IAB TCF consent string (euconsent-v2) is stored. Cookie Lens doesn’t decode it.' };
  return null;
}
