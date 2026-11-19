# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 29.1 ms | 19.8 ms | 29.8 ms | 25.0 ms | 34.8 ms |
| Replace all 1,000 rows | 28.5 ms | 27.7 ms | 26.8 ms | 25.3 ms | 30.8 ms |
| Update every 10th row of 1,000 | 6.7 ms | 14.5 ms | 13.3 ms | 11.1 ms | 7.2 ms |
| Select a row among 1,000 | 3.9 ms | 11.1 ms | 10.4 ms | 6.6 ms | 6.1 ms |
| Swap two rows of 1,000 | 6.8 ms | 13.0 ms | 11.5 ms | 24.1 ms | 7.1 ms |
| Remove one row of 1,000 | 7.5 ms | 16.2 ms | 14.3 ms | 10.5 ms | 6.7 ms |
| Create 10,000 rows | 267.7 ms | 222.7 ms | 220.9 ms | 393.4 ms | 302.3 ms |
| Append 1,000 rows to 1,000 | 29.2 ms | 33.3 ms | 32.8 ms | 28.6 ms | 32.3 ms |
| Clear 1,000 rows | 6.2 ms | 12.8 ms | 9.9 ms | 7.9 ms | 8.3 ms |
| Change one row among 10,000, to the next frame | 32.6 ms | 38.9 ms | 33.1 ms | 38.5 ms | 33.6 ms |
| Change one row among 10,000, until the DOM changed | 1.2 ms | 0.5 ms | 0.5 ms | 3.5 ms | 3.1 ms |
| Heap after 1,000 rows | 4.6 MB | 3.3 MB | 3.7 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 16.6 MB | 14.3 MB | 15.5 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 9.3 ms | 3.1 ms | 4.5 ms | 7.0 ms | 12.1 ms |
| JavaScript shipped (gzip) | 70.0 kB | 6.1 kB | 23.7 kB | 68.0 kB | 98.5 kB |
