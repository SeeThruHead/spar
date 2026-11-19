# Navigation to a page five segments deep

The same page in each: five nested segments that each need one piece of data, and a sixth piece (the report's author) that can only be asked for once the report has answered. Every request takes 50 ms in a stand-in server inside the page, so the best possible time is two round trips, about 100 ms, and six requests in a row would take about 300 ms. Timed from the click on the link until the author's name is in the page, in headless Chromium 159.0.8154.6, median of 10 runs after 2 warm-ups. Rerun with `bun run navigate` at the repo root.

|                                        | Click to last data shown | Requests | First five start within | Sixth waits for the report |
| -------------------------------------- | -----------------------: | -------: | ----------------------: | -------------------------- |
| Spar                                   |                 106.4 ms |        6 |                  0.0 ms | yes                        |
| React, TanStack Router and React Query |                 102.3 ms |        6 |                  0.1 ms | yes                        |
| Foldkit                                |                 105.2 ms |        6 |                  0.1 ms | yes                        |

How each is written. Spar: each segment's component asks for its own data with `Query.ask`, and the author's query takes its input from the report's value; nothing else is declared (`apps/bench/src/nav-spar/Nav.ts`). React: each route has a loader that calls `queryClient.ensureQueryData`, the leaf's loader awaits the report and then the author, and each component reads with `useSuspenseQuery` (`apps/bench/src/nav-react/main.tsx`). Foldkit: this app does not use Foldkit's router (`foldkit/route`); the click's branch of `update` returns the five Commands, and the branch that handles the report's answer returns the sixth (`apps/bench/src/nav-foldkit/main.ts`).
