# What is not done

In the order I would do them.

3. **Overlay placement.** Menus flip above or below their anchor but do not avoid the left and right
   edges. There is no Tooltip, no standalone Popover, and Select is the native control.
4. **Devtools.** No export or import of a log, no outbox view, no MCP server for agents. Only
   actions made in the current session can be stepped to.
5. **State-preserving moves.** Moving a row re-inserts its nodes, which resets an iframe or a
   playing video inside it. `moveBefore` would avoid that where the browser has it.
6. **Server rendering and hydration.** Not started.
7. **Docs site.** The docs are markdown in this folder. There is no generated site and there are no
   diagrams.
8. **Drag and drop.** The proof app does not port the original screen's drag reordering.
