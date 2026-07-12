---
"@brains/cms": patch
"@brains/plugins": patch
---

Replace the CMS body textarea with a CodeMirror 6 markdown source pane and add the first selection-rewrite AI assist route/UI while preserving literal-byte editing and the existing Source/Split/Preview modes.

Expose the plugin AI namespace on service plugin contexts so service-backed routes can perform read-only AI assists.
