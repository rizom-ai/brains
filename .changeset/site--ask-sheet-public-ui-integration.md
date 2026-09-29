---
"@rizom/site": patch
---

Integrate mobile Ask sheet/atlas styling and reuse the public Brain UI highlighted-text renderer. Bundle the shared implementation while keeping the site helper's declaration React-only, preserving independent Core/Site consumer type graphs and release lanes without private UI imports or declaration-leak exceptions.
