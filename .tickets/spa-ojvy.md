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
