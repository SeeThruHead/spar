# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 31.6 ms | 30.3 ms | 30.3 ms | 27.5 ms | 39.3 ms |
| Replace all 1,000 rows | 28.2 ms | 28.8 ms | 27.0 ms | 27.0 ms | 38.7 ms |
| Update every 10th row of 1,000 | 5.7 ms | 11.5 ms | 12.3 ms | 9.9 ms | 6.2 ms |
| Select a row among 1,000 | 4.1 ms | 9.2 ms | 10.4 ms | 6.1 ms | 5.6 ms |
| Swap two rows of 1,000 | 6.0 ms | 12.1 ms | 11.0 ms | 24.3 ms | 5.0 ms |
| Remove one row of 1,000 | 6.2 ms | 13.6 ms | 12.0 ms | 10.4 ms | 5.1 ms |
| Create 10,000 rows | 295.0 ms | 242.4 ms | 246.9 ms | 399.4 ms | 324.6 ms |
| Append 1,000 rows to 1,000 | 35.3 ms | 33.3 ms | 31.3 ms | 32.4 ms | 36.4 ms |
| Clear 1,000 rows | 5.6 ms | 11.3 ms | 7.4 ms | 6.2 ms | 7.3 ms |
| Change one row among 10,000, to the next frame | 40.4 ms | 40.8 ms | 36.8 ms | 39.3 ms | 35.9 ms |
| Change one row among 10,000, until the DOM changed | 1.6 ms | 0.4 ms | 0.5 ms | 4.8 ms | 4.5 ms |
| Heap after 1,000 rows | 4.6 MB | 3.3 MB | 3.7 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 16.5 MB | 14.3 MB | 15.5 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 11.9 ms | 2.9 ms | 4.2 ms | 7.4 ms | 14.9 ms |
| JavaScript shipped (gzip) | 69.2 kB | 6.1 kB | 23.7 kB | 68.0 kB | 98.5 kB |
