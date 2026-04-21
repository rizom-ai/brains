# @rizom/ui

Shared Rizom UI primitives for app-owned Rizom site variants.

## Purpose

This package holds the app-facing Rizom UI layer used by extracted or app-local Rizom sites.
It is intentionally narrower than `@brains/site-rizom` and excludes site/runtime composition concerns.

## Includes

- layout primitives such as `RizomFrame`, `Section`, `Header`, `Footer`, and `SideNav`
- content UI such as `Badge`, `Button`, `Divider`, and `ProductCard`
- shared text rendering helper `renderHighlightedText`
- lightweight shared presentational types

## Does not include

- Rizom site/runtime composition
- site-builder or `SiteInfo` contracts
- app-specific layout helpers
- `createRizomSite(...)`

## Consumer contract

Consumers should install `preact` alongside this package.
