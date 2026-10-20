---
"@rizom/ops": patch
---

Fleet images are named by their Brain version and their site pins: an instance without a site override runs `brain-<version>`, an instance with one runs `brain-<version>--<pins>` (or a digest of the pins when too long to spell out), and every instance with the same version and pins shares one image. A site's pin change builds that site's image and no other, and deploys on its own, because the generated `users/<handle>/.env` now names the image (`IMAGE_TAG`). Promotion reuses a smoke-tested image unchanged, as its name already carries its pins; an existing image is verified against what its name says it holds. Explicit dispatch builds install exactly the dispatched pins. The scaffolded fleet scripts derive the tag from the instance's own pins.
