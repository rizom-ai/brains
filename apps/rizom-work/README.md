# rizom.work

A deployment instance of the [@brains/ranger](../../brains/ranger/) brain model with the [@brains/site-rizom](../../sites/rizom/) site package (variant: `work`) — the distributed consultancy / network face of the Rizom collective.

## Setup

```bash
cp apps/rizom-work/.env.example apps/rizom-work/.env
cd apps/rizom-work
bunx brain start
```

## Site variant

`brain.yaml` selects the `work` variant of `@brains/site-rizom`:

```yaml
site:
  package: "@brains/site-rizom"
  variant: work
```

Variant-specific bits:

- **Background canvas**: `constellation`
- **Accent shade**: amber `#E87722` (dark mode), amber-dark `#C45A08` (light mode)
- **Hero copy**: "Distributed expertise, on demand" register, pitched at team-assembly / network scenarios
- **Ecosystem highlight**: the `rizom.work` card is "You are here"

See [`apps/rizom-ai/README.md`](../rizom-ai/README.md) for the shared variant story.
