# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1, Foldkit 0.170.0 and Effect UI (snapshot 6f86af8), built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-3348e6e2fa688cdb (AMD Ryzen 9 9950X 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server, the median of 40 loads, each in a fresh page, after 2 warm-up loads.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit | effect-ui |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 1.54× Solid<br>53.4 ms | 1.54× Solid<br>53.2 ms | 1.00× Solid<br>34.6 ms | 2.08× Solid<br>71.8 ms | 1.34× Solid<br>46.2 ms | 2.10× Solid<br>72.8 ms | 1.46× Solid<br>50.5 ms |
| Replace all 1,000 rows | 1.53× Solid<br>70.0 ms | 1.24× Solid<br>57.1 ms | 1.00× Solid<br>45.9 ms | 1.39× Solid<br>63.7 ms | 1.17× Solid<br>53.7 ms | 1.46× Solid<br>67.1 ms | 1.78× Solid<br>81.8 ms |
| Update every 10th row of 1,000 | 1.56× Solid<br>23.8 ms | 0.55× Solid<br>8.4 ms | 1.00× Solid<br>15.3 ms | 0.99× Solid<br>15.2 ms | 1.08× Solid<br>16.5 ms | 1.05× Solid<br>16.0 ms | 1.39× Solid<br>21.3 ms |
| Select a row among 1,000 | 0.95× Solid<br>7.2 ms | 1.11× Solid<br>8.4 ms | 1.00× Solid<br>7.6 ms | 1.22× Solid<br>9.3 ms | 0.66× Solid<br>5.0 ms | 1.87× Solid<br>14.2 ms | 0.70× Solid<br>5.3 ms |
| Swap two rows of 1,000 | 0.76× Solid<br>12.9 ms | 1.10× Solid<br>18.6 ms | 1.00× Solid<br>16.9 ms | 0.82× Solid<br>13.9 ms | 2.26× Solid<br>38.2 ms | 0.93× Solid<br>15.7 ms | 1.09× Solid<br>18.4 ms |
| Remove one row of 1,000 | 0.86× Solid<br>16.4 ms | 0.51× Solid<br>9.6 ms | 1.00× Solid<br>19.0 ms | 0.90× Solid<br>17.1 ms | 0.68× Solid<br>12.9 ms | 0.97× Solid<br>18.4 ms | 1.22× Solid<br>23.2 ms |
| Create 10,000 rows | 1.60× Solid<br>572.7 ms | 1.18× Solid<br>421.8 ms | 1.00× Solid<br>357.4 ms | 1.40× Solid<br>499.8 ms | 1.78× Solid<br>636.0 ms | 2.00× Solid<br>715.9 ms | 1.61× Solid<br>575.2 ms |
| Append 1,000 rows to 1,000 | 1.40× Solid<br>87.6 ms | 0.90× Solid<br>56.3 ms | 1.00× Solid<br>62.4 ms | 1.73× Solid<br>108.1 ms | 1.17× Solid<br>73.2 ms | 1.34× Solid<br>83.6 ms | 1.26× Solid<br>78.5 ms |
| Clear 1,000 rows | 1.40× Solid<br>13.0 ms | 1.41× Solid<br>13.1 ms | 1.00× Solid<br>9.3 ms | 1.49× Solid<br>13.9 ms | 1.47× Solid<br>13.7 ms | 2.58× Solid<br>24.0 ms | 0.78× Solid<br>7.3 ms |
| Change one row among 10,000, to the next frame | 1.01× Solid<br>70.2 ms | 1.06× Solid<br>73.4 ms | 1.00× Solid<br>69.4 ms | 1.57× Solid<br>109.3 ms | 1.20× Solid<br>83.0 ms | 1.39× Solid<br>96.4 ms | 1.41× Solid<br>98.0 ms |
| Change one row among 10,000, until the DOM changed | 1.40× Solid<br>1.4 ms | 1.20× Solid<br>1.2 ms | 1.00× Solid<br>1.0 ms | 1.40× Solid<br>1.4 ms | 7.60× Solid<br>7.6 ms | 12.00× Solid<br>12.0 ms | 8.30× Solid<br>8.3 ms |
| Heap after 1,000 rows | 1.39× Solid<br>4.6 MB | 1.38× Solid<br>4.6 MB | 1.00× Solid<br>3.3 MB | 1.12× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.77× Solid<br>5.9 MB | 1.26× Solid<br>4.2 MB |
| Heap after 10,000 rows | 1.26× Solid<br>18.0 MB | 1.26× Solid<br>18.0 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.5 MB | 1.86× Solid<br>26.6 MB | 1.28× Solid<br>18.2 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms |
| Startup, until the app is in the page | 2.03× Solid<br>34.5 ms | 2.23× Solid<br>37.9 ms | 1.00× Solid<br>17.0 ms | 0.91× Solid<br>15.4 ms | 2.52× Solid<br>42.9 ms | 3.71× Solid<br>63.1 ms | 1.58× Solid<br>26.9 ms |
| JavaScript shipped (gzip) | 9.13× Solid<br>55.9 kB | 9.09× Solid<br>55.7 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB | 9.65× Solid<br>59.1 kB |
