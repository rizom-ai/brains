---
"@brains/directory-sync": patch
---

Directory sync leaves an image row alone when its file holds the same bytes as the row's inline data URL, as it already did for a row holding the matching asset reference. Before, the first start of the asset-backed release re-imported every image file next to an inline row, converting it outside the offline migration and holding up startup: on a copy of a production brain with 166 images the web process missed its 30-second readiness deadline.
