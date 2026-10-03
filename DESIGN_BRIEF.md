# Cookie Lens — design brief

> The prompt I'm holding myself to. If a screen breaks a rule here, the screen is wrong, not the rule.

## Direction: "Field Guide"
Cookies treated like specimens in a naturalist's field guide or a museum catalogue: each one gets a label with its
name, where it was found, how long it lives and what it's known for. Warm paper, black ink, and a single vermilion
"stamp" colour reserved for trackers. Calm, factual, a little dry. It should feel like something printed and
annotated by a careful person — not a SaaS dashboard, not a security product shouting at you.

References in spirit: Penguin field guides and specimen labels, Edward Tufte's data-ink tables, uBlock Origin's dense
domain list, the restraint of Are.na and the Stripe Press books.

## Tokens
```
paper      #F4F1EA   page background (never pure white)
paper-2    #EBE6DA   quiet surface shift (table head, hovered row, drawer)
paper-3    #E2DCCD   pressed / selected
rule       #D3CBBA   hairlines, 1px, used only where alignment needs it
ink        #1C1A16   primary text, primary button fill (never pure black)
ink-2      #57524A   secondary text  (≈7:1 on paper)
ink-3      #686154   tertiary/captions (≥4.5:1 on paper and paper-2 — the floor for text)
stamp      #B3361B   trackers / destructive (≈5.4:1 on paper). The ONE accent.
ochre      #8C5B06   "watch" text;  ochre-fill #D7A33A for chart segments
moss       #3E6A3A   "fine" text;   moss-fill  #7FA06E
slate      #44596B   functional category; slate-fill #8DA0AE
unlisted   hatch pattern in ink-3 — unknown is drawn as unknown, not as a colour
```
Category colours appear only in the breakdown bar and its legend. Everywhere else meaning is carried by text + glyph.

Type (all bundled locally, OFL):
- **Instrument Serif** — display: the big counts, page titles, section heads. Numerals large, optical, no bold.
- **Instrument Sans** — UI text 13px popup / 14px dashboard, 500 for labels, 600 sparingly.
- **IBM Plex Mono** — anything a machine wrote: domains, cookie names, paths, dates, flags. Tabular figures.
Scale: 11 / 12 / 13 / 14 / 16 / 20 / 28 / 44 / 64. Small caps-style labels = 11px sans, +0.06em tracking, uppercase, ink-3.

Shape & space: 4px grid. Radius 3px on controls, 0 on sections. No drop shadows except the drawer (one soft edge).
No card containers: sections are separated by whitespace and, where needed, a single hairline rule.

Risk glyphs (SVG, 10px, never colour alone):
- Tracker — filled square, stamp
- Watch — square half-filled diagonally, ochre
- Fine — outline square, moss
Each glyph is followed by the word on first appearance and in legends; rows carry `aria-label`.

Icons: custom 16px SVG line set, 1.5px stroke, square caps — lens, trash, broom, shield/keep, gear, search, chevron,
close, external, download. No emoji anywhere, no icon-in-a-rounded-square.

## Layout
**Popup (360px wide)** — reads top to bottom like a label:
1. Masthead row: tiny wordmark "Cookie Lens" (serif italic) · site hostname in mono · keep-site toggle.
2. The one number: "23" in 64px serif + "cookies on nytimes.com". Next to it, in stamp: "8 trackers".
3. Breakdown bar (stacked, 8px tall, square ends) + legend with counts, then the first-/third-party split sentence.
4. "After load" note — honest consent approximation, one sentence, plus the site's own consent record if decodable.
5. Specimen list grouped by owning domain (company in ink-3). Row: glyph · cookie name (mono) · reason sentence ·
   delete icon button. Row expands inline to show flags.
6. Sticky footer: [Clear 8 trackers] (stamp) [Clear all for this site] (ghost) · "Dashboard ↗". Footnote line:
   "Classified on-device. Nothing leaves your browser."

**Dashboard (full tab)** — a catalogue page, max-width 1180px, left-aligned, not centred hero:
- Header: serif title "Your cookie jar", a one-line explanation, local-only statement.
- Ledger strip: three figures (cookies seen · trackers seen · cookies deleted) with a 30-day bar sparkline under each
  — real stored numbers only; when there is little history the chart says "Tracking since <date>".
- Two columns: "Who follows you" (top tracker domains, bar = number of sites seen on) | "Settings" (auto-clean,
  keep-list).
- The table: every domain currently holding cookies. Columns: domain/company · cookies · trackers · category mix
  · seen on (sites) · expires latest. Search, risk filter chips, sort by any column header, row checkboxes,
  bulk "Delete selected". Expanding a row lists its cookies; clicking one opens the detail drawer from the right.
- Footer "About the data": sources, licences, limitations, in plain text.

## Copy rules
- Facts, not fear: "Set by doubleclick.net, a known ad tracker (Google). Lasts 13 months."
- Say what's approximate: "appeared after the page loaded — often what clicking Accept looks like."
- Empty states are sentences a person would write: "No cookies here. This page didn't set any, or it's a page
  Chrome won't let extensions read."
- No exclamation marks, no "Take control", no "privacy score", no invented percentages.

## Banned (checked before every screenshot)
Purple/indigo, gradients of any kind, Inter/Roboto/system-ui as the visible face, rounded-2xl, shadowed cards,
cards-in-cards, coloured left-border strips as decoration, emoji, glassmorphism, centred hero, three-up feature grid,
fake stats, pure #000/#fff, colour-only status.

## Accessibility
Text contrast ≥ 4.5:1 (ink-3 is the floor). Visible 2px ink focus ring with 2px offset. Every action reachable by Tab;
drawer traps focus and closes on Esc; table headers are buttons with `aria-sort`. Respect `prefers-reduced-motion`.
