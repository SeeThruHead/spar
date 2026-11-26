# Benchmarks

The same table app in Spar, Solid 1.9.19 (solid), Solid 2.0.3 (solid2), React 19.3.1, Foldkit 0.170.0 and Effect UI (snapshot 6f86af8), built with Vite and
driven in headless Chromium 159.0.8154.6 on the CI box box-node-c39789b8fb7d970d (AMD EPYC 4585PX 16-Core Processor, 8 cores), with nothing else running on it. Each number is the median of 10 runs
after 2 warm-up runs, from the click until the next frame after the DOM reached its final state.
Each timed click comes 100 ms after the steps that set it up, so that it does not land in the frame those steps are still drawing.
Lower is better. Rerun with `bun run bench` at the repo root, which also writes docs/benchmarks.html with the graphs.

Each cell leads with the result against Solid's in the same run (Solid is 1.00×), with the measurement under it. The CI pool hands out different machines from week to week, so compare the ratios across weeks, not the milliseconds.

Change one row among 10,000 is the suite chosen for Spar's model, where one store action should end in one text node changing. It is timed twice: to the next frame like the rest, and until the DOM changed, which leaves out the browser's own layout and paint of 10,000 rows. Solid sets one signal. In Spar the store action replaces the row with `Store.withRow`, so the keyed list rewrites that row without walking the other 9,999; what is left is the command itself (its span, its journal entry, the fiber that runs it). Startup is the time from the start of navigation until the app's first button is in the page, from a local server, the median of 40 loads, each in a fresh page, after 2 warm-up loads.

| Operation | spar | spar-composed | solid | solid2 | react | foldkit | effect-ui |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Create 1,000 rows | 1.04× Solid<br>63.8 ms | 1.46× Solid<br>90.0 ms | 1.00× Solid<br>61.6 ms | 1.05× Solid<br>64.7 ms | 1.62× Solid<br>99.7 ms | 1.78× Solid<br>109.7 ms | 1.01× Solid<br>62.1 ms |
| Replace all 1,000 rows | 1.09× Solid<br>90.5 ms | 1.28× Solid<br>106.4 ms | 1.00× Solid<br>83.3 ms | 0.84× Solid<br>69.6 ms | 1.09× Solid<br>91.1 ms | 1.59× Solid<br>132.1 ms | 1.04× Solid<br>86.6 ms |
| Update every 10th row of 1,000 | 0.94× Solid<br>18.6 ms | 1.25× Solid<br>24.7 ms | 1.00× Solid<br>19.7 ms | 1.35× Solid<br>26.6 ms | 1.34× Solid<br>26.3 ms | 1.45× Solid<br>28.5 ms | 1.47× Solid<br>29.0 ms |
| Select a row among 1,000 | 1.19× Solid<br>3.1 ms | 0.96× Solid<br>2.5 ms | 1.00× Solid<br>2.6 ms | 1.35× Solid<br>3.5 ms | 2.69× Solid<br>7.0 ms | 6.31× Solid<br>16.4 ms | 1.50× Solid<br>3.9 ms |
| Swap two rows of 1,000 | 1.02× Solid<br>24.2 ms | 0.99× Solid<br>23.5 ms | 1.00× Solid<br>23.8 ms | 0.84× Solid<br>20.1 ms | 3.89× Solid<br>92.6 ms | 1.01× Solid<br>24.1 ms | 0.75× Solid<br>17.8 ms |
| Remove one row of 1,000 | 0.82× Solid<br>24.7 ms | 0.78× Solid<br>23.5 ms | 1.00× Solid<br>30.1 ms | 0.75× Solid<br>22.5 ms | 0.94× Solid<br>28.3 ms | 0.97× Solid<br>29.2 ms | 0.79× Solid<br>23.8 ms |
| Create 10,000 rows | 1.18× Solid<br>743.4 ms | 1.20× Solid<br>752.6 ms | 1.00× Solid<br>628.7 ms | 1.27× Solid<br>798.3 ms | 1.60× Solid<br>1008.3 ms | 1.56× Solid<br>982.8 ms | 1.02× Solid<br>640.0 ms |
| Append 1,000 rows to 1,000 | 1.11× Solid<br>95.1 ms | 1.38× Solid<br>118.0 ms | 1.00× Solid<br>85.7 ms | 1.38× Solid<br>117.9 ms | 1.40× Solid<br>120.2 ms | 1.44× Solid<br>123.2 ms | 0.95× Solid<br>81.8 ms |
| Clear 1,000 rows | 0.94× Solid<br>14.7 ms | 1.21× Solid<br>18.9 ms | 1.00× Solid<br>15.6 ms | 1.04× Solid<br>16.3 ms | 1.87× Solid<br>29.2 ms | 1.87× Solid<br>29.1 ms | 0.67× Solid<br>10.4 ms |
| Change one row among 10,000, to the next frame | 0.88× Solid<br>133.4 ms | 0.91× Solid<br>138.7 ms | 1.00× Solid<br>152.1 ms | 1.11× Solid<br>168.3 ms | 1.21× Solid<br>183.3 ms | 1.15× Solid<br>175.0 ms | 0.89× Solid<br>135.4 ms |
| Change one row among 10,000, until the DOM changed | 1.14× Solid<br>2.4 ms | 1.86× Solid<br>3.9 ms | 1.00× Solid<br>2.1 ms | 1.81× Solid<br>3.8 ms | 7.90× Solid<br>16.6 ms | 8.24× Solid<br>17.3 ms | 7.48× Solid<br>15.7 ms |
| Heap after 1,000 rows | 1.38× Solid<br>4.6 MB | 1.38× Solid<br>4.6 MB | 1.00× Solid<br>3.3 MB | 1.11× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.76× Solid<br>5.9 MB | 1.26× Solid<br>4.2 MB |
| Heap after 10,000 rows | 1.26× Solid<br>18.0 MB | 1.27× Solid<br>18.1 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.4 MB | 1.86× Solid<br>26.6 MB | 1.28× Solid<br>18.2 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms | 1.99× Solid<br>33.4 ms | 1.98× Solid<br>33.2 ms | 1.00× Solid<br>16.8 ms | 1.00× Solid<br>16.8 ms |
| Startup, until the app is in the page | 3.05× Solid<br>45.1 ms | 4.09× Solid<br>60.5 ms | 1.00× Solid<br>14.8 ms | 2.61× Solid<br>38.6 ms | 3.57× Solid<br>52.8 ms | 4.25× Solid<br>62.9 ms | 2.62× Solid<br>38.8 ms |
| JavaScript shipped (gzip) | 9.16× Solid<br>56.1 kB | 9.11× Solid<br>55.8 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB | 9.65× Solid<br>59.1 kB |
