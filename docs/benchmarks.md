# Benchmarks

The same table app in Spar, Solid 1.9.19, React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid wins it by a wide margin, because it sets one signal. In Spar the store action builds a new array of 10,000 rows and the keyed list is given all of them, so it still walks every key, but it now only compares them and rewrites the one row that changed. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | solid | react | foldkit |
| --- | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 26.3 ms | 28.7 ms | 28.3 ms | 36.3 ms |
| Replace all 1,000 rows | 30.2 ms | 28.3 ms | 25.9 ms | 35.8 ms |
| Update every 10th row of 1,000 | 8.6 ms | 14.6 ms | 10.8 ms | 4.8 ms |
| Select a row among 1,000 | 5.5 ms | 12.3 ms | 5.9 ms | 5.7 ms |
| Swap two rows of 1,000 | 6.9 ms | 14.7 ms | 23.4 ms | 4.4 ms |
| Remove one row of 1,000 | 6.9 ms | 14.7 ms | 12.1 ms | 5.1 ms |
| Create 10,000 rows | 270.2 ms | 201.4 ms | 378.3 ms | 314.1 ms |
| Append 1,000 rows to 1,000 | 32.3 ms | 33.5 ms | 32.0 ms | 28.6 ms |
| Clear 1,000 rows | 6.1 ms | 13.2 ms | 5.8 ms | 9.2 ms |
| Change one row among 10,000, to the next frame | 36.4 ms | 29.2 ms | 37.5 ms | 19.1 ms |
| Change one row among 10,000, until the DOM changed | 2.8 ms | 0.3 ms | 4.2 ms | 8.5 ms |
| Heap after 1,000 rows | 4.7 MB | 3.3 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 18.1 MB | 14.3 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 8.8 ms | 2.5 ms | 7.1 ms | 13.2 ms |
| JavaScript shipped (gzip) | 54.4 kB | 6.1 kB | 68.0 kB | 98.5 kB |
