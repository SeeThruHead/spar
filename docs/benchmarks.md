# Benchmarks

The same table app in Spar, Solid 1.9.19 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run moon run bench:bench`.

| Operation                                 |     spar |    solid |  foldkit |
| ----------------------------------------- | -------: | -------: | -------: |
| Create 1,000 rows                         |  42.8 ms |  30.1 ms |  48.3 ms |
| Replace all 1,000 rows                    |  43.5 ms |  27.1 ms |  52.3 ms |
| Update every 10th row of 1,000            |  14.8 ms |  11.7 ms |  14.3 ms |
| Select a row among 1,000                  |   9.7 ms |   8.6 ms |   9.6 ms |
| Swap two rows of 1,000                    |  12.5 ms |  13.4 ms |  12.3 ms |
| Remove one row of 1,000                   |  11.0 ms |  12.9 ms |  11.4 ms |
| Create 10,000 rows                        | 422.8 ms | 231.7 ms | 474.6 ms |
| Append 1,000 rows to 1,000                |  49.3 ms |  35.6 ms |  59.4 ms |
| Clear 1,000 rows                          |  12.5 ms |   7.5 ms |  16.3 ms |
| Heap after 1,000 rows                     |   4.8 MB |   3.3 MB |   5.8 MB |
| Heap after 10,000 rows                    |  19.1 MB |  14.3 MB |  26.6 MB |
| Typical frame while scrolling 10,000 rows |  16.7 ms |  16.7 ms |  16.7 ms |
| Slowest frame while scrolling 10,000 rows |  16.8 ms |  16.8 ms |  16.8 ms |
| JavaScript shipped (gzip)                 |  57.8 kB |   6.1 kB |  98.4 kB |
