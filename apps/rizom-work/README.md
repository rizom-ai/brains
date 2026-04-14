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
- owns the final work route composition while reusing shared Rizom base primitives

Tracked `site-content` now exists for durable work sections such as:

- `hero`
- `problem`
- `workshop`
- `personas`
- `proof`
- `bridge`
- `ownership`
- `mission`

## Content repo

This instance is now wired for directory-sync against:

- `rizom-ai/rizom-work-content`
