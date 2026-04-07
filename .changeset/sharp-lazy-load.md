---
"@rizom/brain": patch
---

Fix: brain boot no longer eagerly loads the `sharp` native module.

`plugins/site-builder/src/lib/image-optimizer.ts` had a top-level
`import sharp from "sharp"` that triggered native module resolution
when the bundle loaded. On NixOS, Alpine, distroless containers, and
other minimal Linux environments, `sharp`'s prebuilt binaries cannot
find `libstdc++` at standard paths and the `dlopen` fails — crashing
the entire brain boot even on instances that removed the image
plugin via `remove: - image` in `brain.yaml`.

`sharp` is now loaded lazily via `import("sharp")` on first use.
Brain instances that never process images never touch `sharp` at all.
The image plugin still works the same way when enabled; the only
change is the load timing.

Adds a source-level regression test in `plugins/site-builder/test/`
that asserts `image-optimizer.ts` never reintroduces a top-level
runtime import of `sharp`.
