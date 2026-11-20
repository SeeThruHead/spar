# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-9317b1b653cd79c0 (AMD EPYC 4585PX 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 40.9 ms | 52.3 ms | 30.0 ms | 55.1 ms | 49.4 ms | 68.3 ms |
| Replace all 1,000 rows | 36.4 ms | 54.6 ms | 43.3 ms | 55.6 ms | 50.8 ms | 70.1 ms |
| Update every 10th row of 1,000 | 13.3 ms | 11.2 ms | 8.0 ms | 13.2 ms | 12.5 ms | 17.4 ms |
| Select a row among 1,000 | 1.6 ms | 8.8 ms | 3.9 ms | 7.5 ms | 6.6 ms | 14.7 ms |
| Swap two rows of 1,000 | 13.4 ms | 10.6 ms | 14.4 ms | 16.8 ms | 37.9 ms | 11.4 ms |
| Remove one row of 1,000 | 17.5 ms | 10.8 ms | 13.0 ms | 14.5 ms | 15.4 ms | 13.5 ms |
| Create 10,000 rows | 341.2 ms | 377.9 ms | 318.4 ms | 432.0 ms | 534.2 ms | 461.8 ms |
| Append 1,000 rows to 1,000 | 52.6 ms | 64.7 ms | 40.8 ms | 53.5 ms | 57.8 ms | 63.0 ms |
| Clear 1,000 rows | 11.2 ms | 10.3 ms | 10.7 ms | 10.2 ms | 12.8 ms | 14.8 ms |
| Change one row among 10,000, to the next frame | 68.0 ms | 55.6 ms | 76.4 ms | 58.2 ms | 77.1 ms | 64.8 ms |
| Change one row among 10,000, until the DOM changed | 1.4 ms | 1.7 ms | 1.2 ms | 1.2 ms | 9.7 ms | 7.3 ms |
| Heap after 1,000 rows | 4.6 MB | 4.7 MB | 3.3 MB | 3.7 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 16.6 MB | 16.6 MB | 14.3 MB | 15.5 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 23.7 ms | 16.2 ms | 18.3 ms | 11.1 ms | 13.0 ms | 17.9 ms |
| JavaScript shipped (gzip) | 68.6 kB | 68.4 kB | 6.1 kB | 23.7 kB | 68.0 kB | 98.5 kB |
