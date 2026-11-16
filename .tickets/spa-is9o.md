---
id: spa-is9o
status: closed
deps: [spa-ybv7, spa-ajer, spa-qaia, spa-82b8, spa-2nx3]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [ui]
---
# Base components with ARIA and focus management

packages/ui: Button, TextField, Checkbox, Switch, Select or Listbox, Menu, Dialog, Popover, Tabs, Tooltip, Toast. Tokens for colour and shape, light and dark. Keyboard behaviour per WAI-ARIA patterns.

## Acceptance Criteria

Each has stories with play tests and passes axe checks.


## Notes

**2026-11-16T05:47:41Z**

Done: packages/ui (@spar/ui): Button, SubmitButton, TextField, Select (native select), Checkbox, Switch, Tabs (arrow keys, Home, End, roving tabindex), Menu (portal, anchored, arrow keys, Escape, Tab closes, focus returns to its button), Dialog (modal, labelled by its title, backdrop and Close), Toast (service plus a polite live region, auto dismiss after 6 seconds). Colours and shape are CSS custom properties in styles.css with light and dark sets (follows the system, or data-theme). 44 px minimum targets. Static lists (tabs, menu items, options) are built in the component's Effect by calling views. Not built: Tooltip, Popover as its own component, a custom listbox Select. Renderer change: children are applied before other props so a select's value sticks; JSX children may be nested lists. Axe checks and real-browser play tests come with the stories ticket.
