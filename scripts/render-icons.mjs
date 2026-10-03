// Rasterises design/icon.svg into the PNG sizes the manifest needs.
import { chromium } from 'playwright';
import fs from 'node:fs';
const svg = fs.readFileSync(new URL('../design/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage();
for (const s of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}`);
  await page.screenshot({ path: `extension/icons/icon${s}.png`, omitBackground: true });
}
await browser.close();
console.log('icons ok');
