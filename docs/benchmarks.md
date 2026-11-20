# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-9317b1b653cd79c0 (AMD EPYC 4585PX 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 1.34× Solid<br>34.5 ms | 1.27× Solid<br>32.7 ms | 1.00× Solid<br>25.8 ms | 1.28× Solid<br>33.1 ms | 1.22× Solid<br>31.4 ms | 1.74× Solid<br>44.8 ms |
| Replace all 1,000 rows | 1.32× Solid<br>35.8 ms | 1.29× Solid<br>34.9 ms | 1.00× Solid<br>27.1 ms | 1.23× Solid<br>33.4 ms | 1.30× Solid<br>35.2 ms | 1.39× Solid<br>37.8 ms |
| Update every 10th row of 1,000 | 0.38× Solid<br>4.9 ms | 1.17× Solid<br>15.0 ms | 1.00× Solid<br>12.8 ms | 0.94× Solid<br>12.0 ms | 0.67× Solid<br>8.6 ms | 1.02× Solid<br>13.1 ms |
| Select a row among 1,000 | 0.39× Solid<br>3.7 ms | 1.04× Solid<br>9.9 ms | 1.00× Solid<br>9.5 ms | 0.73× Solid<br>6.9 ms | 0.37× Solid<br>3.5 ms | 1.21× Solid<br>11.5 ms |
| Swap two rows of 1,000 | 0.51× Solid<br>5.8 ms | 1.08× Solid<br>12.3 ms | 1.00× Solid<br>11.4 ms | 1.11× Solid<br>12.6 ms | 2.22× Solid<br>25.3 ms | 0.68× Solid<br>7.8 ms |
| Remove one row of 1,000 | 0.47× Solid<br>6.2 ms | 1.10× Solid<br>14.6 ms | 1.00× Solid<br>13.3 ms | 0.89× Solid<br>11.8 ms | 0.77× Solid<br>10.2 ms | 0.40× Solid<br>5.3 ms |
| Create 10,000 rows | 1.16× Solid<br>304.3 ms | 1.20× Solid<br>314.0 ms | 1.00× Solid<br>262.4 ms | 1.10× Solid<br>287.4 ms | 1.79× Solid<br>470.2 ms | 1.23× Solid<br>322.6 ms |
| Append 1,000 rows to 1,000 | 1.09× Solid<br>36.9 ms | 1.35× Solid<br>45.8 ms | 1.00× Solid<br>33.9 ms | 1.19× Solid<br>40.5 ms | 1.28× Solid<br>43.5 ms | 0.96× Solid<br>32.4 ms |
| Clear 1,000 rows | 1.05× Solid<br>6.5 ms | 1.61× Solid<br>10.0 ms | 1.00× Solid<br>6.2 ms | 0.69× Solid<br>4.3 ms | 0.85× Solid<br>5.3 ms | 0.85× Solid<br>5.3 ms |
| Change one row among 10,000, to the next frame | 1.10× Solid<br>43.5 ms | 1.05× Solid<br>41.6 ms | 1.00× Solid<br>39.6 ms | 0.99× Solid<br>39.3 ms | 1.80× Solid<br>71.3 ms | 1.11× Solid<br>44.0 ms |
| Change one row among 10,000, until the DOM changed | 1.50× Solid<br>0.9 ms | 1.67× Solid<br>1.0 ms | 1.00× Solid<br>0.6 ms | 1.00× Solid<br>0.6 ms | 14.00× Solid<br>8.4 ms | 16.67× Solid<br>10.0 ms |
| Heap after 1,000 rows | 1.38× Solid<br>4.6 MB | 1.42× Solid<br>4.7 MB | 1.00× Solid<br>3.3 MB | 1.11× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.77× Solid<br>5.9 MB |
| Heap after 10,000 rows | 1.17× Solid<br>16.8 MB | 1.17× Solid<br>16.8 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.5 MB | 1.87× Solid<br>26.7 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms |
| Startup, until the app is in the page | 2.98× Solid<br>12.2 ms | 3.12× Solid<br>12.8 ms | 1.00× Solid<br>4.1 ms | 1.27× Solid<br>5.2 ms | 2.49× Solid<br>10.2 ms | 3.88× Solid<br>15.9 ms |
| JavaScript shipped (gzip) | 11.20× Solid<br>68.6 kB | 11.17× Solid<br>68.4 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB |
