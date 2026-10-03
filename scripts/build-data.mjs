// Converts the upstream datasets in data-src/ into compact JSON the extension loads locally.
// Run: node scripts/build-data.mjs
import fs from 'node:fs';
const src = new URL('../data-src/', import.meta.url);
const out = new URL('../extension/data/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, src), 'utf8');

// --- Open Cookie Database (Apache-2.0) ---
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; if (row.length > 1) rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const CAT = { Necessary: 'necessary', Security: 'necessary', Functional: 'functional', Personalization: 'functional', Analytics: 'analytics', Marketing: 'marketing' };
const [head, ...rows] = parseCSV(read('ocd.csv'));
const col = (n) => head.indexOf(n);
const iCat = col('Category'), iPlat = col('Platform'), iName = col('Cookie / Data Key name'), iDom = col('Domain'),
  iDesc = col('Description'), iRet = col('Retention period'), iCtl = col('Data Controller'), iWild = col('Wildcard match');
const entries = [], exact = {}, prefixes = [];
for (const r of rows) {
  const name = (r[iName] || '').trim(); const cat = CAT[(r[iCat] || '').trim()];
  if (!name || !cat) continue;
  const idx = entries.push([cat, r[iPlat].trim(), r[iDesc].trim(), r[iRet].trim(), r[iCtl].trim(), r[iDom].trim()]) - 1;
  if (r[iWild].trim() === '1') prefixes.push([name, idx]);
  else (exact[name] ||= []).push(idx);
}
prefixes.sort((a, b) => b[0].length - a[0].length);
fs.writeFileSync(new URL('ocd.json', out), JSON.stringify({ entries, exact, prefixes }));

// --- Disconnect tracking protection list (CC BY-NC-SA 4.0) ---
const PRIORITY = ['Advertising', 'Social', 'Cryptomining', 'FingerprintingInvasive', 'Analytics', 'FingerprintingGeneral', 'EmailAggressive', 'Email', 'Anti-fraud', 'ConsentManagers', 'Content'];
const CODE = { FingerprintingInvasive: 'fingerprinting', FingerprintingGeneral: 'fingerprinting', Advertising: 'advertising', Social: 'social', Cryptomining: 'cryptomining', Analytics: 'analytics', EmailAggressive: 'email', Email: 'email', 'Anti-fraud': 'antifraud', ConsentManagers: 'consent', Content: 'content' };
const dis = JSON.parse(read('disconnect.json'));
const companies = [], companyIdx = {}, domains = {};
for (const cat of PRIORITY.slice().reverse()) { // lower priority first so higher overwrites
  for (const svc of dis.categories[cat] || []) {
    for (const [company, info] of Object.entries(svc)) {
      if (!(company in companyIdx)) companyIdx[company] = companies.push(company) - 1;
      for (const [k, list] of Object.entries(info)) {
        if (!Array.isArray(list)) continue;
        for (const d of list) {
          const key = d.toLowerCase(); const prev = domains[key];
          const fp = (cat.startsWith('Fingerprinting') ? 1 : 0) | (prev ? prev[2] : 0);
          domains[key] = [CODE[cat], companyIdx[company], fp];
        }
      }
    }
  }
}
fs.writeFileSync(new URL('trackers.json', out), JSON.stringify({ companies, domains }));

// --- Public Suffix List (MPL-2.0) ---
const rules = [], wild = [], excp = [];
for (let line of read('psl.dat').split('\n')) {
  line = line.trim(); if (!line || line.startsWith('//')) continue;
  if (line.startsWith('!')) excp.push(line.slice(1));
  else if (line.startsWith('*.')) wild.push(line.slice(2));
  else rules.push(line);
}
fs.writeFileSync(new URL('psl.json', out), JSON.stringify({ rules, wild, excp }));
console.log(`ocd ${entries.length} (${prefixes.length} prefix) · trackers ${Object.keys(domains).length} domains / ${companies.length} companies · psl ${rules.length}`);
