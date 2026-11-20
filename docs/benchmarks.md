# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-1a56816fa820968d (AMD Ryzen 9 9950X 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 33.8 ms | 34.9 ms | 27.7 ms | 37.6 ms | 39.3 ms | 53.2 ms |
| Replace all 1,000 rows | 36.7 ms | 36.7 ms | 34.5 ms | 32.5 ms | 45.1 ms | 48.1 ms |
| Update every 10th row of 1,000 | 13.5 ms | 6.3 ms | 10.2 ms | 8.6 ms | 12.8 ms | 11.8 ms |
| Select a row among 1,000 | 10.2 ms | 9.5 ms | 6.2 ms | 4.0 ms | 3.5 ms | 11.0 ms |
| Swap two rows of 1,000 | 14.1 ms | 13.5 ms | 8.4 ms | 9.5 ms | 39.1 ms | 9.0 ms |
| Remove one row of 1,000 | 7.3 ms | 16.0 ms | 12.5 ms | 8.8 ms | 11.4 ms | 13.0 ms |
| Create 10,000 rows | 365.6 ms | 343.8 ms | 265.0 ms | 271.7 ms | 465.1 ms | 418.3 ms |
| Append 1,000 rows to 1,000 | 44.7 ms | 45.2 ms | 35.4 ms | 33.8 ms | 45.7 ms | 63.2 ms |
| Clear 1,000 rows | 11.1 ms | 10.2 ms | 6.7 ms | 5.1 ms | 10.5 ms | 9.4 ms |
| Change one row among 10,000, to the next frame | 51.7 ms | 50.9 ms | 52.1 ms | 43.9 ms | 53.1 ms | 57.4 ms |
| Change one row among 10,000, until the DOM changed | 1.2 ms | 1.1 ms | 0.6 ms | 0.7 ms | 6.6 ms | 6.1 ms |
| Heap after 1,000 rows | 4.6 MB | 4.6 MB | 3.3 MB | 3.7 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 16.6 MB | 16.6 MB | 14.3 MB | 15.5 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 13.6 ms | 15.0 ms | 4.9 ms | 7.8 ms | 11.0 ms | 28.2 ms |
| JavaScript shipped (gzip) | 68.2 kB | 68.0 kB | 6.1 kB | 23.7 kB | 68.0 kB | 98.5 kB |
