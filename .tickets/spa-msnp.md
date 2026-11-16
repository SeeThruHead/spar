---
id: spa-msnp
status: in_progress
deps: []
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 0
assignee: Shane Keulen
tags: [repo]
---
# Moon monorepo skeleton and the prototype core ported to packages/spar

bun workspaces, moon 2.6.4, strict tsconfig.base (greenfield list), oxfmt, oxlint, TypeScript 7 with effect-tsgo. Move src, tests and forbidden fixtures from ~/tmp/investigations/ui-framework into packages/spar and apps/demo.

## Acceptance Criteria

bun run check passes from a clean clone: format, lint, typecheck, forbidden proofs, unit tests.

