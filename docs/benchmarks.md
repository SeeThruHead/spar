# Benchmarks

The same table app in Spar, Solid 1.9.19 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run moon run bench:bench`.

| Operation                                 |     spar |    solid |  foldkit |
| ----------------------------------------- | -------: | -------: | -------: |
| Create 1,000 rows                         |  29.3 ms |  29.8 ms |  33.6 ms |
| Replace all 1,000 rows                    |  30.5 ms |  28.9 ms |  37.9 ms |
| Update every 10th row of 1,000            |   8.6 ms |  13.6 ms |   7.2 ms |
| Select a row among 1,000                  |   5.2 ms |  12.5 ms |   4.5 ms |
| Swap two rows of 1,000                    |   6.9 ms |  11.8 ms |   6.2 ms |
| Remove one row of 1,000                   |   8.4 ms |  15.2 ms |   5.9 ms |
| Create 10,000 rows                        | 267.5 ms | 210.8 ms | 306.2 ms |
| Append 1,000 rows to 1,000                |  32.0 ms |  35.1 ms |  38.1 ms |
| Clear 1,000 rows                          |   5.1 ms |  10.7 ms |   5.9 ms |
| Heap after 1,000 rows                     |   4.7 MB |   3.3 MB |   5.9 MB |
| Heap after 10,000 rows                    |  17.4 MB |  14.3 MB |  26.7 MB |
| Typical frame while scrolling 10,000 rows |  16.7 ms |  16.7 ms |  16.7 ms |
| Slowest frame while scrolling 10,000 rows |  16.8 ms |  16.8 ms |  16.8 ms |
| JavaScript shipped (gzip)                 |  63.0 kB |   6.1 kB |  98.4 kB |
