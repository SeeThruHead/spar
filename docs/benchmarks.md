# Benchmarks

The same table app in Spar, Solid 1.9.19, React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | solid | react | foldkit |
| --- | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 37.8 ms | 27.3 ms | 27.7 ms | 41.5 ms |
| Replace all 1,000 rows | 39.4 ms | 39.0 ms | 28.2 ms | 39.1 ms |
| Update every 10th row of 1,000 | 9.1 ms | 10.3 ms | 11.2 ms | 5.9 ms |
| Select a row among 1,000 | 6.8 ms | 8.4 ms | 6.7 ms | 4.3 ms |
| Swap two rows of 1,000 | 11.1 ms | 6.7 ms | 23.8 ms | 5.7 ms |
| Remove one row of 1,000 | 9.8 ms | 12.9 ms | 9.0 ms | 5.6 ms |
| Create 10,000 rows | 288.7 ms | 256.9 ms | 424.1 ms | 337.5 ms |
| Append 1,000 rows to 1,000 | 36.2 ms | 35.3 ms | 28.1 ms | 33.3 ms |
| Clear 1,000 rows | 8.9 ms | 8.7 ms | 8.4 ms | 5.8 ms |
| Change one row among 10,000, to the next frame | 57.1 ms | 32.7 ms | 42.0 ms | 36.0 ms |
| Change one row among 10,000, until the DOM changed | 2.2 ms | 0.5 ms | 5.0 ms | 3.2 ms |
| Heap after 1,000 rows | 4.6 MB | 3.3 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 16.5 MB | 14.3 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 15.7 ms | 3.4 ms | 7.9 ms | 13.2 ms |
| JavaScript shipped (gzip) | 67.2 kB | 6.1 kB | 68.0 kB | 98.5 kB |
