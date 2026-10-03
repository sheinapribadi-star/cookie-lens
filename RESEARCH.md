# Cookie Lens — research notes

Scratch notes written before any code. Sources are linked inline. Dates: Oct 2026.

## (a) How real privacy extensions work and present themselves

| Extension | Detection model | UX pattern worth borrowing | What I'd avoid |
|---|---|---|---|
| **Privacy Badger** (EFF) — [design doc](https://github.com/EFForg/privacybadger/blob/master/doc/DESIGN-AND-ROADMAP.md), [FAQ](https://www.eff.org/privacybadger) | Behavioural: a third-party domain seen tracking (cookies, local-storage "supercookies", canvas fingerprinting, pixel cookie-sharing) on 3+ first-party sites gets blocked. Cookie-value entropy is estimated in "identifying bits" (low-entropy cookies under ~12 bits are ignored). Local learning is now off by default because the learned state itself can fingerprint you. | Three-state slider per third-party domain (block / cookie-block / allow) — they argue it is *less* confusing than toggles because the visual state is the current state, not an opportunity. One escape hatch: "Disable for this site". | Cartoon mascot; very busy list. |
| **uBlock Origin** — [popup guide](https://github.com/gorhill/uBlock/wiki/Quick-guide:-popup-user-interface) | Curated filter lists + optional dynamic filtering. | One big per-site power button; terse numeric stats ("blocked on this page / since install / %"); "More" expands a dense domain list with coloured left bars and +/− magnitude glyphs instead of exact counts; compact number formatting (`Intl.NumberFormat` compact). Proof that *dense* can be calm if alignment is strict. | Firewall grid is too expert for this audience. |
| **Ghostery** — [Ghostery 10 notes](https://www.ghostery.com/blog/launching-ghostery-10-adblocker), [WhoTracks.Me categories](https://www.ghostery.com/whotracksme) | Curated tracker DB (WhoTracks.Me). | Lead with ONE number (trackers on this page) + category breakdown; per-tracker detail drawer with company, purpose, policy link. Explicit reminder that "not every observed activity collects personal data" — honest framing. Full-page history view was requested by users (daily: pages, trackers blocked) and must say "none of this leaves your browser". | The donut "tracker wheel" is their signature — don't copy it. |
| **DuckDuckGo Privacy Essentials** — [tracker-blocklists](https://github.com/duckduckgo/tracker-blocklists/tree/main/web) | Tracker Radar → blocklist with owner entity, prevalence, cookie %, fingerprinting score 0–3. | Groups trackers by *company* ("Google, Meta…") which is more meaningful to people than raw hostnames. | Letter grades feel like fake precision. |
| **Cookie AutoDelete** — [docs](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/wiki/Documentation) | No classification — deletes cookies of sites with no open tab on tab close / domain change / restart. | Keep-list (whitelist) and restart-list; auto-clean is OFF until the user turns it on "so you have the chance to add sites to the keep-list first" — a considerate default I'll copy. Shows cookie count on the badge. | Settings are dense jargon. |
| **EditThisCookie / Cookie-Editor** | Raw cookie jar viewer/editor for the current tab. | Exact field display (domain, path, expiry, Secure, HttpOnly, SameSite) in a monospace detail panel; per-cookie delete. | No "so what?" layer: every cookie looks equally scary/equally fine. EditThisCookie was also removed from the Web Store over MV2/ownership issues — a reminder to keep permissions minimal and be transparent. |

Takeaways for Cookie Lens:
1. Lead with one honest number, then a breakdown, then the list (Ghostery/uBO order).
2. Group cookies by owning domain + company (DDG), with a plain-English "why" per cookie (what EditThisCookie lacks).
3. Risk must be visible without colour alone (shape/text), and the reason must be factual: list membership, lifetime, flags.
4. Auto-clean ships OFF; keep-list first (Cookie AutoDelete).
5. Say explicitly that nothing leaves the browser (Ghostery history issue).

### Chrome APIs (MV3) — [chrome.cookies docs](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- `chrome.cookies.getAll({url})` only returns cookies that would be sent to that URL — i.e. first-party for the tab. Third-party cookies must be found by learning which hosts the page talked to, then `getAll({domain})` for each.
- Observational `chrome.webRequest` (no blocking) is still allowed in MV3 and is the reliable way to know which hosts a tab contacted. Alternative (content script reading `performance` entries) needs the same host access and misses iframes.
- CHIPS: `getAll` returns only unpartitioned cookies unless `partitionKey` is passed; pass `{topLevelSite}` to also read partitioned third-party cookies for the tab's site.
- `cookies.onChanged` must be registered at the top level of the service worker; it gives `cause` (explicit / overwrite / expired / evicted / expired_overwrite) — useful for timing "new cookie after page load".
- `tab.url` is readable with host permissions alone, so the `tabs` permission is not needed. `tabs.onRemoved` works without it too.

## (b) Avoiding the "AI-generated" look

Sources: [vibecodekit — AI slop design](https://vibecodekit.dev/ai-slop-design), [avoid-ai-design](https://github.com/funboy322/avoid-ai-design), [BSWEN prompt guide](https://docs.bswen.com/blog/2026-03-27-prompt-ai-better-ui-design/), [Tyloch](https://tyloch.biz/posts/stop-ai-ui-looking-ai-generated/), [google-labs design.md](https://github.com/google-labs-code/design.md).

The tells (ranked roughly by how loudly they say "generated"):
- purple→blue / indigo gradients, gradient text on big numbers;
- Inter / Roboto / system stack for everything, no display face; Space Grotesk as a "safe distinctive" non-choice;
- `rounded-2xl shadow-lg` cards everywhere, cards inside cards, glassmorphism;
- a coloured 3–4px left-border strip on cards as decoration (called out as "the single most reliable AI tell");
- a flat 1px grey border round every block;
- emoji or icon-in-a-rounded-square bullets;
- centred hero + three feature cards; timid evenly spread palette; pure #fff/#000;
- marketing copy ("Take control of your privacy", "Elevate…"), fake stats ("Trusted by 10,000+").

What makes it feel crafted:
- Commit to ONE named direction and lock tokens in a brief before writing UI (DESIGN.md approach).
- Real type pairing with a display face; numbers set in tabular figures; strict hierarchy (one big thing per view).
- Restrained palette: neutrals + one dominant accent + semantic colours used only for meaning.
- Separate with whitespace first, then a slight background shift, rules (hairlines) only where alignment needs it.
- Dense-but-calm data tables with aligned columns (uBO), monospace for machine strings (domains, cookie names).
- Considered empty/edge states (chrome:// pages, no cookies, allow-listed site) written like a person.
- Honest microcopy: say what is known vs approximated.
- Contrast checked (WCAG AA 4.5:1 for text), visible focus rings, full keyboard path.

## (c) Classifying cookies honestly

Data, bundled locally (no network at runtime):
- **Open Cookie Database** — https://github.com/jkwakman/Open-Cookie-Database — **Apache-2.0**. ~2,260 entries: platform, category (Necessary / Functional / Analytics / Marketing / Security / Personalization), cookie name, optional domain, description, retention, controller, and a wildcard flag (name prefix match, e.g. `_ga_`). Used for name → category/platform/description.
- **Disconnect tracking protection list** (`services.json`) — https://github.com/disconnectme/disconnect-tracking-protection — **CC BY-NC-SA 4.0**. ~2,300 companies → domains, categories Advertising, Analytics, Social, FingerprintingInvasive/General, Cryptomining, Email(Aggressive), Content, Anti-fraud, ConsentManagers. Used for cookie-domain → tracker category + company. Non-commercial + share-alike: fine for a free, open-source portfolio project; attribution in README and in the extension's About panel; derived JSON keeps the same license. (DuckDuckGo Tracker Radar / TDS is also CC BY-NC-SA 4.0 and much larger — Disconnect is the leaner choice and is what Firefox ETP uses.)
- **Public Suffix List** — https://publicsuffix.org — **MPL-2.0**. Needed to get registrable domains (eTLD+1) so `bbc.co.uk` vs `ads.bbc.co.uk` and first- vs third-party are judged correctly.

Heuristics layered on top (each one becomes a sentence in the "why" text, never a hidden score):
- **Third-party**: cookie's registrable domain ≠ tab's registrable domain.
- **Known tracker domain** (Disconnect Advertising/Analytics/Social/Fingerprinting/Cryptomining).
- **OCD category** Marketing / Analytics.
- **Long lifetime**: > 1 year persistent (ePrivacy guidance generally expects ≤ 13 months for consent-based cookies; flag > 400 days as "unusually long" — Chrome caps at 400 days anyway).
- **Identifier-like value**: ≥ 16 chars and high Shannon entropy (≥ 3.5 bits/char) — computed in memory only; values are never stored.
- **Missing protections** on third-party cookies: `SameSite=None` is required for cross-site use, so that's expected; flag missing `Secure` on any cookie and missing `HttpOnly` on session-looking cookies as info, not risk.

Risk levels (3, plus "unknown" stays honest):
- **Tracker** — known tracker domain (ad/social/fingerprinting) OR OCD Marketing; or third-party + identifier + long life.
- **Watch** — analytics (first- or third-party), or third-party unknown with an ID-like value.
- **Fine** — OCD Necessary/Functional/Security, or first-party with no tracking signals.
- **Unknown** category shown as "Unlisted" rather than guessed.

### "Accepted cookies" — what can honestly be measured
An extension cannot see whether the user clicked "Accept". What it *can* see:
1. Non-essential (analytics/marketing/tracker) cookies that are **created after the page finished loading** in that tab (`webNavigation.onCompleted` time vs `cookies.onChanged` time). Consent banners usually gate these until a click, so a burst after load is a reasonable — but not certain — signal. Labelled "appeared after load".
2. **Consent-record cookies** from common CMPs which encode the choice: OneTrust `OptanonConsent` (`groups=C0001:1,C0002:0,…`), Cookiebot `CookieConsent` (`necessary:true,preferences:…,statistics:…,marketing:…`), IAB TCF `euconsent-v2` (presence only; decoding the TC string is out of scope). When decodable, we show what the record says, quoted, and call it "the site's own consent record".
Never presented as "you accepted N cookies".
