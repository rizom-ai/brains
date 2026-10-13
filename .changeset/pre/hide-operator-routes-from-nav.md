---
"@rizom/brain": patch
---

Fix: hide `/admin/` and `/dashboard` from public navigation.

Both routes were registered with `navigation.show: true` in the
secondary slot, which meant every layout that surfaces secondary nav in
the footer — including `PersonalLayout` — leaked operator tooling into
public navigation on every Brain site.

Admin and Dashboard are operator interfaces, not public pages. They
still render their routes and remain reachable by direct URL; they just
no longer appear in auto-generated navigation menus.
