---
"@brains/ai-service": patch
"@brains/plugins": patch
"@brains/core": patch
"@brains/contracts": patch
"@brains/image": patch
"@brains/image-plugin": patch
"@rizom/brain": patch
---

A brain can describe an image for its alt text. The new `image:image-describe` job asks the image-reading model (the configured local `visionModel`, else a cloud model, which reads images itself) for one sentence of at most 125 characters, and stores it with `altSource: "generated"`. Alt text the owner wrote (`altSource: "owner"`) is never replaced; SVG images and brains with no model that reads images keep their fallback. Entity jobs reach the model through `images.canDescribe()` and `images.describe()`.
