# Third-party data and fonts bundled with Cookie Lens

| File | Source | License |
|---|---|---|
| `data/ocd.json` | Open Cookie Database, https://github.com/jkwakman/Open-Cookie-Database (converted from `open-cookie-database.csv`) | Apache License 2.0 |
| `data/trackers.json` | Disconnect tracking protection list, https://github.com/disconnectme/disconnect-tracking-protection (`services.json`), Copyright 2010-2026 Disconnect, Inc. | CC BY-NC-SA 4.0. This derived file is shared under the same license and used non-commercially. |
| `data/psl.json` | Public Suffix List, https://publicsuffix.org | Mozilla Public License 2.0 |
| `fonts/instrument-serif-*`, `fonts/instrument-sans-*` | Instrument Serif / Instrument Sans by Instrument (via Fontsource) | SIL Open Font License 1.1 |
| `fonts/ibm-plex-mono-*` | IBM Plex Mono by IBM (via Fontsource) | SIL Open Font License 1.1 |

Lists were downloaded on 2 Oct 2026. Re-run `npm run build:data` after refreshing `data-src/` to update them.
