# Benchmarks

The same table app in Spar, Solid 1.9.19 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run moon run bench:bench`.

| Operation                                 |     spar |    solid |  foldkit |
| ----------------------------------------- | -------: | -------: | -------: |
| Create 1,000 rows                         |  25.1 ms |  22.2 ms |  34.8 ms |
| Replace all 1,000 rows                    |  28.1 ms |  28.6 ms |  29.0 ms |
| Update every 10th row of 1,000            |   5.0 ms |  14.6 ms |   6.8 ms |
| Select a row among 1,000                  |  15.7 ms |  12.7 ms |   7.7 ms |
| Swap two rows of 1,000                    |   4.7 ms |  13.9 ms |   7.4 ms |
| Remove one row of 1,000                   |   5.2 ms |  16.3 ms |   8.7 ms |
| Create 10,000 rows                        | 243.1 ms | 212.0 ms | 281.5 ms |
| Append 1,000 rows to 1,000                |  28.5 ms |  33.2 ms |  27.9 ms |
| Clear 1,000 rows                          |   4.8 ms |  13.2 ms |   7.4 ms |
| Heap after 1,000 rows                     |   4.6 MB |   3.3 MB |   5.9 MB |
| Heap after 10,000 rows                    |  17.4 MB |  14.3 MB |  26.7 MB |
| Typical frame while scrolling 10,000 rows |  16.7 ms |  16.7 ms |  16.7 ms |
| Slowest frame while scrolling 10,000 rows |  16.8 ms |  16.8 ms |  16.8 ms |
| JavaScript shipped (gzip)                 |  59.7 kB |   6.1 kB |  98.4 kB |
