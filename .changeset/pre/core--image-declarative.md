---
"@rizom/brain": patch
---

Images are a declarative entity package. They are stored, created and rendered as before: the same `image` plugin and type, kept out of embeddings and projection sourcing, storing each image's data URL byte for byte with its metadata beside it; the same create routes for a prompt, a cover, a source attachment and an upload, writing the same pending image and answering with the same link; and the same `image:image-generate`, `image:image-render-source` and `image:upload-promote` jobs, which other packages queue by contract as before and which point a target's cover or OG image at what they made. `@brains/image` exports `createImageEntity` and `imageMetadataFor` in place of the image adapter.
