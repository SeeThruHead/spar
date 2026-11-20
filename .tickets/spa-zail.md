---
id: spa-zail
status: closed
deps: []
links: []
created: 2026-11-20T01:03:13Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, site, cheap-model]
---
# A plain view cannot be mounted with props from a component's Effect without a View.taking wrapper

apps/site needed NavGroup = View.taking(fields, outer => ...)(NavGroupView); Haiku wrote the same wrapper. Let View.child take a view.


## Notes

**2026-11-20T06:58:56Z**

Obsolete under compose: a View.make view is a JSX tag and can be the last thing given to compose; the site's NavGroup is compose(withProps(...), ...)(NavGroupView).
