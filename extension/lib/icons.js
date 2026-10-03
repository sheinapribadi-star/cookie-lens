// Hand-drawn 16px line icons (1.5 stroke, square caps). Returned as SVG strings.
const wrap = (body, size = 16) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${body}</svg>`;
export const icon = {
  lens: (s) => wrap('<circle cx="6.75" cy="6.75" r="4.25"/><path d="M10 10l4 4"/><path d="M5 5.5h.01M7.5 8h.01M8 5h.01" stroke-width="2"/>', s),
  trash: (s) => wrap('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4M6.75 6.5v4.5M9.25 6.5v4.5"/>', s),
  broom: (s) => wrap('<path d="M10.5 1.5l-3 6M4 8h7l1 6.5H3z"/><path d="M6 14.5l.5-3M9 14.5l-.5-3"/>', s),
  keep: (s) => wrap('<path d="M8 1.75l5.25 2v4c0 3.25-2.25 5.25-5.25 6.5-3-1.25-5.25-3.25-5.25-6.5v-4z"/><path d="M5.75 8l1.6 1.6L10.5 6.4"/>', s),
  gear: (s) => wrap('<circle cx="8" cy="8" r="2.25"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>', s),
  search: (s) => wrap('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/>', s),
  chevron: (s) => wrap('<path d="M6 3.5L10.5 8 6 12.5"/>', s),
  close: (s) => wrap('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>', s),
  external: (s) => wrap('<path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v4h-9v-9h4"/>', s),
  download: (s) => wrap('<path d="M8 2v8.5M4.5 7L8 10.5 11.5 7M2.5 13.5h11"/>', s),
  lock: (s) => wrap('<rect x="3" y="7" width="10" height="7"/><path d="M5.25 7V5a2.75 2.75 0 015.5 0v2"/>', s),
  info: (s) => wrap('<circle cx="8" cy="8" r="6.25"/><path d="M8 7v4.5M8 4.75v.5"/>', s),
};
/** Risk glyph: filled / half / outline square. Shape carries meaning, not colour alone. */
export function glyph(risk, label = true) {
  const t = { tracker: 'Tracker', watch: 'Watch', fine: 'Fine' }[risk];
  const shape = risk === 'tracker' ? '<rect x="1" y="1" width="8" height="8" fill="currentColor"/>'
    : risk === 'watch' ? '<rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor"/><path d="M1 9L9 1V9z" fill="currentColor"/>'
    : '<rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor"/>';
  return `<span class="glyph glyph--${risk}" ${label ? `role="img" aria-label="${t}"` : 'aria-hidden="true"'}><svg width="10" height="10" viewBox="0 0 10 10">${shape}</svg></span>`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
