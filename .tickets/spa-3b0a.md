---
id: spa-3b0a
status: closed
deps: []
links: []
created: 2026-11-20T07:49:45Z
type: bug
priority: 2
assignee: Shane Keulen
tags: [flaky]
---
# Flaky under load: spar test fork.test.ts 'goes back and forward one moment at a time' failed once in the full check while the machine was busy; passes alone


## Notes

**2026-11-20T08:42:40Z**

Likely cause: under load the third Add's moment was not yet in the timeline when step(-1) ran. addThree now waits until three moments are recorded. Passes 3 of 3; watch for recurrence.
