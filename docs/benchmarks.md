# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1 and Foldkit 0.170.0, built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-9317b1b653cd79c0 (AMD EPYC 4585PX 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 1.38× Solid<br>37.3 ms | 1.24× Solid<br>33.7 ms | 1.00× Solid<br>27.1 ms | 1.07× Solid<br>28.9 ms | 1.38× Solid<br>37.3 ms | 1.83× Solid<br>49.5 ms |
| Replace all 1,000 rows | 1.20× Solid<br>41.0 ms | 1.14× Solid<br>39.1 ms | 1.00× Solid<br>34.2 ms | 0.83× Solid<br>28.3 ms | 1.23× Solid<br>42.2 ms | 1.37× Solid<br>47.0 ms |
| Update every 10th row of 1,000 | 0.90× Solid<br>9.1 ms | 1.51× Solid<br>15.3 ms | 1.00× Solid<br>10.1 ms | 0.78× Solid<br>7.9 ms | 1.04× Solid<br>10.5 ms | 1.14× Solid<br>11.5 ms |
| Select a row among 1,000 | 1.05× Solid<br>8.1 ms | 0.83× Solid<br>6.4 ms | 1.00× Solid<br>7.7 ms | 1.10× Solid<br>8.5 ms | 1.26× Solid<br>9.7 ms | 1.77× Solid<br>13.6 ms |
| Swap two rows of 1,000 | 1.04× Solid<br>9.6 ms | 1.24× Solid<br>11.4 ms | 1.00× Solid<br>9.2 ms | 0.98× Solid<br>9.0 ms | 3.63× Solid<br>33.4 ms | 1.46× Solid<br>13.4 ms |
| Remove one row of 1,000 | 1.28× Solid<br>17.0 ms | 1.29× Solid<br>17.1 ms | 1.00× Solid<br>13.3 ms | 0.92× Solid<br>12.3 ms | 0.64× Solid<br>8.5 ms | 1.10× Solid<br>14.6 ms |
| Create 10,000 rows | 1.61× Solid<br>410.1 ms | 1.41× Solid<br>360.8 ms | 1.00× Solid<br>255.4 ms | 1.20× Solid<br>306.6 ms | 1.82× Solid<br>464.8 ms | 1.68× Solid<br>428.3 ms |
| Append 1,000 rows to 1,000 | 1.08× Solid<br>43.1 ms | 1.15× Solid<br>46.0 ms | 1.00× Solid<br>40.0 ms | 1.07× Solid<br>43.0 ms | 0.97× Solid<br>38.7 ms | 1.33× Solid<br>53.1 ms |
| Clear 1,000 rows | 0.98× Solid<br>9.3 ms | 1.23× Solid<br>11.7 ms | 1.00× Solid<br>9.5 ms | 0.63× Solid<br>6.0 ms | 1.00× Solid<br>9.5 ms | 1.76× Solid<br>16.7 ms |
| Change one row among 10,000, to the next frame | 1.29× Solid<br>57.6 ms | 1.09× Solid<br>48.8 ms | 1.00× Solid<br>44.8 ms | 1.00× Solid<br>44.7 ms | 1.27× Solid<br>57.1 ms | 1.06× Solid<br>47.4 ms |
| Change one row among 10,000, until the DOM changed | 1.75× Solid<br>1.4 ms | 1.37× Solid<br>1.1 ms | 1.00× Solid<br>0.8 ms | 1.00× Solid<br>0.8 ms | 7.75× Solid<br>6.2 ms | 6.00× Solid<br>4.8 ms |
| Heap after 1,000 rows | 1.34× Solid<br>4.5 MB | 1.38× Solid<br>4.6 MB | 1.00× Solid<br>3.3 MB | 1.11× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.76× Solid<br>5.9 MB |
| Heap after 10,000 rows | 1.17× Solid<br>16.7 MB | 1.16× Solid<br>16.5 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.5 MB | 1.87× Solid<br>26.7 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms |
| Startup, until the app is in the page | 3.81× Solid<br>16.0 ms | 2.24× Solid<br>9.4 ms | 1.00× Solid<br>4.2 ms | 1.50× Solid<br>6.3 ms | 2.10× Solid<br>8.8 ms | 4.52× Solid<br>19.0 ms |
| JavaScript shipped (gzip) | 9.64× Solid<br>59.0 kB | 9.60× Solid<br>58.8 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB |
