// Loads the bundled datasets (extension-local files, never the network) and exposes lookups.
let ready = null;
let OCD, TRACKERS, PSL;

export function loadData() {
  if (!ready) {
    const get = (f) => fetch(chrome.runtime.getURL(`data/${f}`)).then((r) => r.json());
    ready = Promise.all([get('ocd.json'), get('trackers.json'), get('psl.json')]).then(([o, t, p]) => {
      OCD = o; TRACKERS = t;
      PSL = { rules: new Set(p.rules), wild: new Set(p.wild), excp: new Set(p.excp) };
    });
  }
  return ready;
}

/** Registrable domain (eTLD+1) using the Public Suffix List. */
export function baseDomain(host) {
  host = String(host || '').toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
  if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  for (let i = 0; i < labels.length; i++) {
    const cand = labels.slice(i).join('.');
    if (PSL.excp.has(cand)) return cand; // exception rule: cand itself is registrable
    const parent = labels.slice(i + 1).join('.');
    if (PSL.rules.has(cand) || (parent && PSL.wild.has(parent))) {
      return i === 0 ? host : labels.slice(i - 1).join('.');
    }
  }
  return labels.slice(-2).join('.');
}

/** Disconnect list lookup, walking up the hostname. */
export function trackerInfo(host) {
  host = String(host || '').toLowerCase().replace(/^\.+/, '');
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const hit = TRACKERS.domains[parts.slice(i).join('.')];
    if (hit) return { kind: hit[0], company: TRACKERS.companies[hit[1]], fingerprinting: !!hit[2], matched: parts.slice(i).join('.') };
  }
  return null;
}

/** Open Cookie Database lookup by cookie name (exact, then prefix/wildcard). */
export function ocdInfo(name, cookieDomain) {
  const pick = (idxs) => {
    const d = String(cookieDomain || '').replace(/^\./, '');
    const rows = idxs.map((i) => OCD.entries[i]);
    const byDomain = rows.find((r) => r[5] && d && (d.endsWith(r[5].replace(/\s*\(.*\)$/, '')) || r[5].includes(baseDomain(d))));
    const r = byDomain || rows[0];
    return { category: r[0], platform: r[1], description: r[2], retention: r[3], controller: r[4] };
  };
  if (OCD.exact[name]) return pick(OCD.exact[name]);
  for (const [prefix, idx] of OCD.prefixes) if (name.startsWith(prefix)) return pick([idx]);
  return null;
}
