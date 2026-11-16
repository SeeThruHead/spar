---
id: spa-ajer
status: closed
deps: [spa-juqy, spa-ybv7]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Portals and overlays through one enhancer

View.portal mounts a component into an overlay root with its own scope; focus trap, scroll lock, dismiss on outside click and Escape, stacking.

## Acceptance Criteria

A modal and a popover in the demo, focus trapped and restored, tested in a browser.


## Notes

**2026-11-16T05:18:34Z**

Done: View.portal mounts a component in its own layer inside an overlay root that App.mount adds next to the app (and removes on unmount); the layer goes when the component's scope closes. Overlay.modal({ onDismiss, initialFocus }) makes the app and every lower layer inert, locks page scrolling, moves focus into the layer (or to the given handle), dismisses on Escape only for the top layer, and on close restores inert state, scrolling and focus. Overlay.dismissable({ onDismiss, anchor }) is for menus and popovers: Escape, or a press outside the layer and its anchor. Overlay.position(anchor) gives reactive fixed-position styles below the anchor, or above it when there is more room, updated on resize and scroll. Decisions: inert replaces a hand-written focus trap; a component that uses Overlay.modal or dismissable needs the layer in its type, so using them outside View.portal is a compile error at mount (proof added); the frame the app provides shows in a component's requirements and App.mount takes it out. Horizontal collision handling is not done. A real-browser test of dialogs comes with the base components.
