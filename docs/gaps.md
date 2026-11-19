# What is not done

Everything that was on this list has been built. What remains is outside what this repo can check
on its own.

1. **Real phones and tablets.** Every browser test runs in desktop builds of Chromium, Firefox and
   WebKit at phone, tablet and desktop sizes. Nothing has been tried on a physical device, so touch
   behaviour (dragging a row with a finger, the on-screen keyboard over a dialog) is unverified.
   Unblocked by: a device, or a device farm, to run the same suites on.
2. **A screen reader.** Roles, names and focus are tested and audited with axe, which checks the
   markup, not what a screen reader says. Unblocked by: a person listening with VoiceOver or NVDA
   through the stories and the proof app.
3. **Seeing a joined trace in Tempo.** Run with a collector set, the page and the backend both
   export their spans and neither is refused, and the devtools draw the joined trace from the
   page's and the backend's own span buffers, which is tested. Nobody has looked the same trace up
   in Tempo. Unblocked by: opening Grafana after running the proof app with `OTLP_ENDPOINT` set.
