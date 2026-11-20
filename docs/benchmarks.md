# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-9317b1b653cd79c0 (AMD EPYC 4585PX 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 1.39× Solid<br>39.1 ms | 1.28× Solid<br>36.0 ms | 1.00× Solid<br>28.1 ms | 0.89× Solid<br>24.9 ms | 1.10× Solid<br>31.0 ms | 1.52× Solid<br>42.6 ms |
| Replace all 1,000 rows | 1.45× Solid<br>40.6 ms | 1.25× Solid<br>34.9 ms | 1.00× Solid<br>28.0 ms | 1.16× Solid<br>32.5 ms | 1.41× Solid<br>39.4 ms | 1.53× Solid<br>42.9 ms |
| Update every 10th row of 1,000 | 0.50× Solid<br>6.2 ms | 1.02× Solid<br>12.5 ms | 1.00× Solid<br>12.3 ms | 0.72× Solid<br>8.9 ms | 0.65× Solid<br>8.0 ms | 0.92× Solid<br>11.3 ms |
| Select a row among 1,000 | 1.81× Solid<br>11.2 ms | 1.66× Solid<br>10.3 ms | 1.00× Solid<br>6.2 ms | 0.87× Solid<br>5.4 ms | 0.56× Solid<br>3.5 ms | 2.00× Solid<br>12.4 ms |
| Swap two rows of 1,000 | 1.94× Solid<br>17.1 ms | 1.32× Solid<br>11.6 ms | 1.00× Solid<br>8.8 ms | 0.75× Solid<br>6.6 ms | 2.73× Solid<br>24.0 ms | 1.43× Solid<br>12.6 ms |
| Remove one row of 1,000 | 1.60× Solid<br>16.2 ms | 1.58× Solid<br>16.0 ms | 1.00× Solid<br>10.1 ms | 0.95× Solid<br>9.6 ms | 1.42× Solid<br>14.3 ms | 1.50× Solid<br>15.2 ms |
| Create 10,000 rows | 1.24× Solid<br>318.5 ms | 1.36× Solid<br>349.4 ms | 1.00× Solid<br>256.6 ms | 1.07× Solid<br>275.3 ms | 1.59× Solid<br>409.2 ms | 1.42× Solid<br>365.2 ms |
| Append 1,000 rows to 1,000 | 1.12× Solid<br>37.4 ms | 1.17× Solid<br>39.1 ms | 1.00× Solid<br>33.5 ms | 1.16× Solid<br>38.7 ms | 1.43× Solid<br>47.9 ms | 1.43× Solid<br>47.9 ms |
| Clear 1,000 rows | 2.00× Solid<br>12.8 ms | 1.45× Solid<br>9.3 ms | 1.00× Solid<br>6.4 ms | 0.91× Solid<br>5.8 ms | 2.02× Solid<br>12.9 ms | 2.36× Solid<br>15.1 ms |
| Change one row among 10,000, to the next frame | 1.20× Solid<br>48.7 ms | 1.20× Solid<br>48.7 ms | 1.00× Solid<br>40.5 ms | 1.02× Solid<br>41.4 ms | 1.49× Solid<br>60.5 ms | 1.20× Solid<br>48.7 ms |
| Change one row among 10,000, until the DOM changed | 2.00× Solid<br>1.0 ms | 2.40× Solid<br>1.2 ms | 1.00× Solid<br>0.5 ms | 1.60× Solid<br>0.8 ms | 9.40× Solid<br>4.7 ms | 8.40× Solid<br>4.2 ms |
| Heap after 1,000 rows | 1.37× Solid<br>4.6 MB | 1.34× Solid<br>4.5 MB | 1.00× Solid<br>3.3 MB | 1.11× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.76× Solid<br>5.9 MB |
| Heap after 10,000 rows | 1.15× Solid<br>16.5 MB | 1.17× Solid<br>16.6 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.5 MB | 1.87× Solid<br>26.7 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms |
| Startup, until the app is in the page | 2.39× Solid<br>11.0 ms | 2.33× Solid<br>10.7 ms | 1.00× Solid<br>4.6 ms | 1.41× Solid<br>6.5 ms | 1.72× Solid<br>7.9 ms | 3.67× Solid<br>16.9 ms |
| JavaScript shipped (gzip) | 9.89× Solid<br>60.6 kB | 9.87× Solid<br>60.4 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB |
