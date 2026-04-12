# rizom.work

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model — the distributed consultancy / network face of the Rizom collective, now using a thin `@brains/site-rizom-work` wrapper over shared Rizom base primitives.

## Setup

```bash
cp apps/rizom-work/.env.example apps/rizom-work/.env
cd apps/rizom-work
bunx brain start
```

## Site package

`brain.yaml` now points at `@brains/site-rizom-work`, a thin site-package wrapper over `@brains/site-rizom`.

That wrapper currently does three things:

- injects the `work` canvas/plugin config
- owns the work shell model (nav/footer/side-nav labels)
- replaces the inherited hero with the first work-specific split hero + diagnostic panel seam
