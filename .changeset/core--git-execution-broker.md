---
"@rizom/brain": patch
---

Add a supervised Git execution broker for directory-sync. Git commands run under an OS-owned wrapper that holds an advisory checkout lock, enforces the inactivity deadline outside any application event loop, and proves the process group is gone before publishing a result. The broker observes that wrapper through durable records instead of awaiting a child, so a lost child completion can neither wedge nor prematurely release checkout ownership, and one checkout has a single owner across the web and worker processes rather than a separate in-memory queue in each. The broker child is supervised with its own restart budget, starts before web and worker, and stops after them. It is not yet routed to by any caller and stays off by default.
