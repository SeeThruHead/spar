# What is not done

In the order I would do them.

1. **Durable stores across tabs.** A durable store assumes one writing tab. Two tabs on the same
   store would overwrite each other's log slots. The outbox already handles two tabs.
2. **Memory.** At 10,000 rows Spar holds about 61 MB against 14 MB for Solid and 27 MB for Foldkit.
   Each row has its own scope and its own closures.
3. **Row creation speed.** About 2 times Solid. The remaining cost is one Effect scope and several
   Effect steps per row.
4. **Overlay placement.** Menus flip above or below their anchor but do not avoid the left and right
   edges. There is no Tooltip, no standalone Popover, and Select is the native control.
5. **Devtools.** No export or import of a log, no outbox view, no MCP server for agents. Only
   actions made in the current session can be stepped to.
6. **Routing.** A page is remounted when any of its params change, query included. There is no
   scroll restoration beyond scrolling to the top on a new page.
7. **State-preserving moves.** Moving a row re-inserts its nodes, which resets an iframe or a
   playing video inside it. `moveBefore` would avoid that where the browser has it.
8. **Server rendering and hydration.** Not started.
9. **Docs site.** The docs are markdown in this folder. There is no generated site and there are no
   diagrams.
10. **Mutation testing.** Not set up; coverage is 100% but mutants have not been run.
11. **Drag and drop.** The proof app does not port the original screen's drag reordering.
