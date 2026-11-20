# What is not done

Two things need a person or a device. The rest of the list is small and is written down so nobody
has to find it.

1. **A screen reader.** axe audits every story and every step of the proof app, and the proof
   app's walkthrough compares what the browser hands to assistive technology (roles, names and
   states, in reading order) with the copies in `apps/sidebar/spoken`, in all three engines. It
   also checks that a dialog takes focus when it opens and gives it back when it closes, and that a
   toast sits in a live region. None of that hears what VoiceOver, NVDA or TalkBack says or when.
   Unblocked by: a person listening through the stories and the proof app.
2. **Real phones and tablets.** Every browser test runs in desktop builds of Chromium, Firefox and
   WebKit at phone, tablet and desktop sizes. Only a physical device can show:
   - dragging a row or a section with a finger (the tests fire drag events directly; a touch drag
     starts with a long press), though the move buttons and the row menu do the same job;
   - whether the on-screen keyboard covers a dialog's field or its error message;
   - menus, tooltips and dialogs against a real phone viewport (the collapsing address bar, the
     notch and home bar insets, pinch zoom);
   - tooltips, which open on hover or focus, on a screen with no hover;
   - Mobile Safari itself, since the WebKit tested is the desktop Linux build;
   - speed and memory on phone hardware;
   - going offline for real (airplane mode, a tab put in the background and brought back);
   - VoiceOver or TalkBack driven by touch.

   Unblocked by: a device, or a device farm, to run the same suites on.

Built since, and smaller than they sound, but not done:

- **Generated ids in `@spar/ui` come from a counter, not a store.** A tooltip or a listbox asks
  for an id when it mounts. Decided to leave it: an id is not state anyone would rewind to, and an
  action for every id would bury the log. Toasts did move to a store.
- **A fork lives in the page.** A durable store's saved log is not rewritten by a fork, so a reload
  returns to what was saved. Decided not to build keeping forks on the device as a leftover: a
  parked branch holds each store's state in memory as a way to resume it, and to save it the
  branches would have to become plain data that every kind of store can be loaded from, durable
  ones and ones with an outbox included. A store's log can be exported and loaded again, which is
  the way to keep one today.
- **The showcase is not drawn on the server.** `apps/ssr` shows server rendering, with a routed
  page and queries. Decided not to do it for `apps/sidebar` as a leftover: its board is a store
  kept on the device, so the server cannot know what the browser will show, and taking over a
  server-drawn page whose data then changes under it needs a rule Spar does not have yet (which
  wins, and when the swap is shown).
- **Queries:** an optimistic change stays shown if its
  send fails for good, until something invalidates the query.
- **A page sent in pieces is redrawn whole.** Each piece of finished HTML is the whole page drawn
  again, not only the part that changed, and it needs scripts turned on (a one-line script, not
  the app's bundle).
- **An event's span names its view only with the devtools on.** The renderer does not know
  which view drew a node; the inspector does.
- **A query's default stale time is 0,** so a preload that finishes before the click, or a page
  drawn on the server, is asked for again unless the query sets `staleAfter`.
- **Spar does not check that every action has considered every state** of a state machine store.
  A guard you did not write is a command that is accepted.
- **What a JSX child needs is checked by the build, not by the types.** TypeScript gives every JSX
  expression one type, so the Vite build reads the code instead (`SPAR_CHILD_NEEDS_A_SERVICE`). It
  follows components across files and reads the layer given to `App.mount`, but not through
  everything code can do: a layer built by a function declaration, a component from a package, or
  a service reached only through `Effect.service` is not seen, and such a child still fails when
  it mounts. The Bun plugin checks one file at a time.
- **The bundle is large and starts slower than Solid's.** The benchmark app ships 68 kB gzipped
  (Solid 6 kB, React 68 kB) and is on the page in 13.6 ms (Solid 4.9 ms). About 35 kB is the floor
  any Effect front end pays; the start-up time is the browser parsing and running that bundle, not
  any one slow function (`docs/benchmarks.md`).

The joined trace has been looked up in Tempo: run with `OTLP_ENDPOINT` set, one form submit in the
proof app came back from Tempo as one trace with spans from the page and from the backend under one
root, both send attempts included. `sidebar:traced` prints the trace id to look up.

To record the accessibility trees again after a deliberate change to the proof app's markup, run
the walkthrough with `SPOKEN=write` and read the diff.
