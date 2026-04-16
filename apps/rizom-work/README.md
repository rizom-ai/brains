# rizom.work

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model — the distributed consultancy / network face of the Rizom collective, now owning its composition from app-local `src/site.ts` over the shared [@brains/site-rizom](../../sites/rizom/) core.

## Setup

```bash
cp apps/rizom-work/.env.example apps/rizom-work/.env
cd apps/rizom-work
bunx brain start
```

## Local site source

`brain.yaml` now omits an explicit `site.package`, so the runtime picks up app-local `src/site.ts`.

That local site source currently does three things:

- injects the `work` canvas/plugin config
- owns the work shell model (nav/footer/side-nav labels)
- owns the final work route composition while reusing the shared Rizom site core

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
