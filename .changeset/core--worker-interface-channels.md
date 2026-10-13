---
"@rizom/brain": patch
---

Contact alerts and other background jobs can send email again. The queue worker runs no interfaces, so it had no Email sender and every alert failed as `transport-missing`. Message interfaces now register their channels and senders in a `registerChannels()` step that the worker also runs, without the interface's daemons, routes or subscriptions. Declarative message interfaces' `setup` runs there too, so `deliver` has its state; `setup` must build clients without connecting or listening.
