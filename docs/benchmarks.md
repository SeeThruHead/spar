# Benchmarks

The same table app in Spar, Solid 1.9.19, React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Spar does not win it. Until the DOM changed it is the slowest of the four. The cause has not been profiled; the store action builds a new array of 10,000 rows and the keyed list is given all of them again, where Solid sets one signal. Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | solid | react | foldkit |
| --- | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 27.5 ms | 28.7 ms | 28.7 ms | 38.4 ms |
| Replace all 1,000 rows | 28.2 ms | 26.8 ms | 27.6 ms | 27.6 ms |
| Update every 10th row of 1,000 | 8.2 ms | 10.6 ms | 8.9 ms | 8.1 ms |
| Select a row among 1,000 | 4.5 ms | 9.9 ms | 6.4 ms | 7.4 ms |
| Swap two rows of 1,000 | 7.5 ms | 11.2 ms | 23.7 ms | 8.7 ms |
| Remove one row of 1,000 | 7.2 ms | 9.6 ms | 11.2 ms | 7.2 ms |
| Create 10,000 rows | 267.9 ms | 266.4 ms | 452.5 ms | 250.4 ms |
| Append 1,000 rows to 1,000 | 29.4 ms | 36.2 ms | 31.7 ms | 27.1 ms |
| Clear 1,000 rows | 5.6 ms | 9.4 ms | 5.6 ms | 8.3 ms |
| Change one row among 10,000, to the next frame | 34.4 ms | 46.3 ms | 47.7 ms | 24.2 ms |
| Change one row among 10,000, until the DOM changed | 7.1 ms | 0.5 ms | 4.0 ms | 3.7 ms |
| Heap after 1,000 rows | 4.5 MB | 3.3 MB | 4.3 MB | 5.9 MB |
| Heap after 10,000 rows | 17.6 MB | 14.3 MB | 18.5 MB | 26.7 MB |
| Typical frame while scrolling 10,000 rows | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Slowest frame while scrolling 10,000 rows | 16.8 ms | 16.8 ms | 16.8 ms | 16.8 ms |
| Startup, until the app is in the page | 9.4 ms | 2.8 ms | 5.6 ms | 11.6 ms |
| JavaScript shipped (gzip) | 54.1 kB | 6.1 kB | 68.0 kB | 98.5 kB |
