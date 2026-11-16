# Benchmarks

The same table app in Spar, Solid 1.9.19 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on this machine. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run moon run bench:bench`.

| Operation                                 |     spar |    solid |  foldkit |
| ----------------------------------------- | -------: | -------: | -------: |
| Create 1,000 rows                         |  59.3 ms |  27.8 ms |  37.7 ms |
| Replace all 1,000 rows                    |  73.2 ms |  26.8 ms |  37.0 ms |
| Update every 10th row of 1,000            |  12.4 ms |   9.1 ms |   6.0 ms |
| Select a row among 1,000                  |   9.8 ms |   7.6 ms |  10.5 ms |
| Swap two rows of 1,000                    |  12.9 ms |   7.4 ms |  14.2 ms |
| Remove one row of 1,000                   |  12.4 ms |  11.8 ms |  13.7 ms |
| Create 10,000 rows                        | 541.4 ms | 245.7 ms | 376.7 ms |
| Append 1,000 rows to 1,000                |  62.5 ms |  34.7 ms |  47.5 ms |
| Clear 1,000 rows                          |  17.7 ms |   7.8 ms |  14.5 ms |
| Heap after 1,000 rows                     |   9.0 MB |   3.3 MB |   5.9 MB |
| Heap after 10,000 rows                    |  60.9 MB |  14.3 MB |  26.7 MB |
| Typical frame while scrolling 10,000 rows |  16.7 ms |  16.7 ms |  16.7 ms |
| Slowest frame while scrolling 10,000 rows |  16.8 ms |  16.8 ms |  16.8 ms |
| JavaScript shipped (gzip)                 |  56.3 kB |   6.1 kB |  98.4 kB |
