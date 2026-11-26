---
id: spa-ojvy
status: open
deps: []
links: []
created: 2026-11-20T08:13:04Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal7, perf]
---
# Bundle: the table app ships 72.2 kB gzipped; the Effect floor is 35.2 kB

Measured with apps/bench/scripts/bundle-parts.ts: Effect running one effect 8.5 kB gz; Effect with a service, layer, Schema, stream and span 35.2 kB gz (the floor any Effect front end pays); Spar reading one reactive value 14.2 kB; the benchmark app 72.2 kB (Solid 6.1, React 68.0, Foldkit 98.5). Unminified, effect is 89% of the app (Effect.js 98 kB, Schema.js 80, internal/effect 70, SchemaAST 64; Schema.js alone pulls http/Cookies and net/NetAddress). Spar's largest: Store 15.8 kB, render 12.7, Diagnostics 9.6 (the full text of every code, shipped to the browser), dom 8.8, journal 7.3. Cheapest wins: ship diagnostic text only in development (codes and a docs link in production); check which Effect modules the store journal pulls (Queue, PubSub, MutableList) and whether Cell can replace them.


## Notes

**2026-11-20T09:29:15Z**

Startup (13.6 ms vs Solid 4.9 on the CI box): a CPU profile of page load shows no hot Spar function; the largest self time is the bundle's module evaluation (1.8 ms) and the rest is spread thin, so the gap is parse/compile/evaluate of the 210 kB minified bundle. Shrinking the bundle is the startup fix too.

**2026-11-20T09:48:41Z**

Checked 'Select a row' (CI table: Spar 10.2 ms, React 3.5, to the next frame): to the DOM change Spar takes 0.10 ms and React 0.30 (20 clicks, median, profiled), and the earlier STHDEV table had Spar 4.5 vs React 5.1. The to-the-frame number is dominated by frame alignment; no Spar change needed.

**2026-11-20T11:00:44Z**

Decided not to strip diagnostic text from production builds: Diagnostics.ts is 10.7 kB before gzip, and those texts are the messages agents read in production logs; trimming them works against the point. The remaining bundle work is structural (Effect's floor, Stream under Reactive.changes).

**2026-11-26T11:12:39Z**

26 Nov, main d4481d6 + PR 14: the benchmark app is 164.0 kB minified, 57.0 kB gzipped (was 72.2). By source map (scratch bundle-sources.ts): effect 122.3 kB (internal/effect 26.6, SchemaAST 25.9, core 5.1, Schema 5.0, Duration 5.0, Queue 4.0), spar 38.2 kB (render 6.1, uiTree 4.0, dom 3.7, store 3.7, said 3.5, html 1.8, App 1.5, Tabs 1.1), app 3.5 kB. What Spar could still avoid (Queue/Channel/MutableList under Reactive and listen, html.ts reached through App's route rehearsal, Tabs through State) is about 10 kB minified, a few kB gzipped. The rest is Effect's runtime and Schema, the floor. Left open, low priority.
