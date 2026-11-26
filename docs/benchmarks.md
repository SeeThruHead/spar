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
| Create 1,000 rows | 0.96× Solid<br>95.1 ms | 1.04× Solid<br>102.2 ms | 1.00× Solid<br>98.6 ms | 0.82× Solid<br>80.7 ms | 0.52× Solid<br>50.8 ms | 0.94× Solid<br>92.4 ms | 0.54× Solid<br>53.2 ms |
| Replace all 1,000 rows | 0.96× Solid<br>100.2 ms | 1.12× Solid<br>116.7 ms | 1.00× Solid<br>104.2 ms | 1.32× Solid<br>137.8 ms | 0.80× Solid<br>83.8 ms | 1.05× Solid<br>109.5 ms | 0.69× Solid<br>71.4 ms |
| Update every 10th row of 1,000 | 0.74× Solid<br>22.2 ms | 0.89× Solid<br>26.8 ms | 1.00× Solid<br>30.2 ms | 1.02× Solid<br>30.7 ms | 0.64× Solid<br>19.2 ms | 1.01× Solid<br>30.6 ms | 0.81× Solid<br>24.4 ms |
| Select a row among 1,000 | 0.77× Solid<br>3.6 ms | 0.77× Solid<br>3.6 ms | 1.00× Solid<br>4.7 ms | 0.81× Solid<br>3.8 ms | 1.04× Solid<br>4.9 ms | 2.13× Solid<br>10.0 ms | 0.94× Solid<br>4.4 ms |
| Swap two rows of 1,000 | 1.39× Solid<br>31.3 ms | 1.37× Solid<br>30.8 ms | 1.00× Solid<br>22.5 ms | 0.89× Solid<br>20.0 ms | 2.58× Solid<br>58.1 ms | 1.07× Solid<br>24.1 ms | 1.14× Solid<br>25.6 ms |
| Remove one row of 1,000 | 0.80× Solid<br>22.8 ms | 1.16× Solid<br>33.2 ms | 1.00× Solid<br>28.5 ms | 1.39× Solid<br>39.6 ms | 0.87× Solid<br>24.7 ms | 0.84× Solid<br>23.8 ms | 1.14× Solid<br>32.4 ms |
| Create 10,000 rows | 1.02× Solid<br>798.5 ms | 1.16× Solid<br>911.9 ms | 1.00× Solid<br>785.6 ms | 1.04× Solid<br>820.7 ms | 1.25× Solid<br>984.1 ms | 1.14× Solid<br>891.7 ms | 0.89× Solid<br>697.8 ms |
| Append 1,000 rows to 1,000 | 0.91× Solid<br>115.7 ms | 1.05× Solid<br>133.6 ms | 1.00× Solid<br>127.6 ms | 1.09× Solid<br>138.7 ms | 0.83× Solid<br>106.1 ms | 0.78× Solid<br>99.7 ms | 1.03× Solid<br>131.6 ms |
| Clear 1,000 rows | 0.91× Solid<br>20.2 ms | 0.97× Solid<br>21.5 ms | 1.00× Solid<br>22.1 ms | 0.94× Solid<br>20.8 ms | 1.00× Solid<br>22.1 ms | 1.02× Solid<br>22.5 ms | 0.65× Solid<br>14.4 ms |
| Change one row among 10,000, to the next frame | 0.92× Solid<br>183.4 ms | 1.01× Solid<br>200.0 ms | 1.00× Solid<br>198.6 ms | 1.03× Solid<br>204.7 ms | 0.82× Solid<br>163.0 ms | 0.87× Solid<br>172.8 ms | 0.94× Solid<br>186.9 ms |
| Change one row among 10,000, until the DOM changed | 1.05× Solid<br>4.4 ms | 1.07× Solid<br>4.5 ms | 1.00× Solid<br>4.2 ms | 0.98× Solid<br>4.1 ms | 5.43× Solid<br>22.8 ms | 4.76× Solid<br>20.0 ms | 7.31× Solid<br>30.7 ms |
| Heap after 1,000 rows | 1.38× Solid<br>4.6 MB | 1.39× Solid<br>4.6 MB | 1.00× Solid<br>3.3 MB | 1.11× Solid<br>3.7 MB | 1.29× Solid<br>4.3 MB | 1.76× Solid<br>5.9 MB | 1.26× Solid<br>4.2 MB |
| Heap after 10,000 rows | 1.26× Solid<br>18.0 MB | 1.26× Solid<br>18.0 MB | 1.00× Solid<br>14.3 MB | 1.09× Solid<br>15.5 MB | 1.29× Solid<br>18.5 MB | 1.86× Solid<br>26.6 MB | 1.28× Solid<br>18.2 MB |
| Typical frame while scrolling 10,000 rows | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms | 1.00× Solid<br>16.7 ms |
| Slowest frame while scrolling 10,000 rows | 1.00× Solid<br>33.4 ms | 1.00× Solid<br>33.3 ms | 1.00× Solid<br>33.4 ms | 0.50× Solid<br>16.8 ms | 0.50× Solid<br>16.8 ms | 1.00× Solid<br>33.3 ms | 1.00× Solid<br>33.3 ms |
| Startup, until the app is in the page | 1.28× Solid<br>60.1 ms | 1.46× Solid<br>68.8 ms | 1.00× Solid<br>47.1 ms | 0.48× Solid<br>22.4 ms | 1.04× Solid<br>48.9 ms | 1.66× Solid<br>78.2 ms | 1.20× Solid<br>56.7 ms |
| JavaScript shipped (gzip) | 9.16× Solid<br>56.1 kB | 9.11× Solid<br>55.8 kB | 1.00× Solid<br>6.1 kB | 3.86× Solid<br>23.7 kB | 11.10× Solid<br>68.0 kB | 16.09× Solid<br>98.5 kB | 9.65× Solid<br>59.1 kB |
