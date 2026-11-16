---
id: spa-ptii
status: closed
deps: [spa-g51c]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 0
assignee: Shane Keulen
tags: [repo]
---
# Private Gitea repo sth/spar and Gitea Actions on the boat runner with the moon cache

Create the repo through the Gitea API with the admin token from OpenBao (never in argv). Workflow runs the same moon tasks as local. MOON_CACHE_TOKEN as an Actions secret.

## Acceptance Criteria

A push to main runs check and it is green.


## Notes

**2026-11-16T04:49:18Z**

Both jobs (check, browser) are green on the Events commit. The runner executes jobs on the STHDEV host, so Chromium is installed without system packages, and setup-bun is fetched from GitHub by absolute URL.
