---
"@brains/image": patch
"@brains/site-engine": patch
"@rizom/brain": patch
---

Require asset references for completed image entities and reject inline image content without decoding it. Remove unused data-URL conversion helpers and base64 inspection overloads; preserve native byte inspection, empty pending/failed placeholders and explicit site-build rejection. Legacy inline rows require offline conversion, not runtime compatibility. Canonical eval image seeds now use PNG files rather than inline markdown payloads.
