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

- **Toasts and generated ids in `@spar/ui` keep their state in a `Ref`.** The package is outside
  the build rule, so a toast appearing is not an entry in the log. They should move to a store.
- **A socket made with `effect/socket` is not seen by `Backend`.** The build refuses
  `new WebSocket` in app code, but a stream of socket messages is not logged as calls. Turn each
  message into a store command and it is in the log from there.
- **A fork lives in the page.** A durable store's saved log is not rewritten by a fork, so a reload
  returns to what was saved. A store that was made beside a view stays listed in the devtools
  after its view unmounts.
- **For agents:** an action's payload Schema is not reported, several actions cannot be sent in
  one call, and with several tabs open the tools speak for the one that reported last
  (`docs/devtools-compared.md`).
- **Queries are not keyed by parameters.** One query store holds one value, so the agent page's
  server record still loads in its component's Effect. Optimistic updates on a query, retries and
  dropping unused data are not built either.
- **Spar does not check that every action has considered every state** of a state machine store.
  A guard you did not write is a command that is accepted.
- **The showcase is `apps/sidebar`, and server rendering is shown by `apps/ssr`.** No single app
  uses every feature.

The joined trace has been looked up in Tempo: run with `OTLP_ENDPOINT` set, one form submit in the
proof app came back from Tempo as one trace with spans from the page and from the backend under one
root, both send attempts included. `sidebar:traced` prints the trace id to look up.

To record the accessibility trees again after a deliberate change to the proof app's markup, run
the walkthrough with `SPOKEN=write` and read the diff.
