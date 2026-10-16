---
"@rizom/brain": patch
---

Update the direct JS-YAML parser to 4.3.2 and the nested gray-matter/read-yaml-file parsers to 3.15.2. Retain the updated defaults: merge sequences over 100 sources are refused, and empty source mappings count toward the existing merge-work budget. Preserve ordered-map handling for prototype-named keys and reject duplicates.

Cover the YAML utilities, uncached Markdown frontmatter, and typed/generic content formatters. Ordinary authored data and Markdown bodies still round-trip; the generic formatter retains its plain-text fallback on refused YAML. No parser-limit override, cache-policy change, historical-content rewrite or clean-security-audit claim is introduced. Merge accounting does not establish bounds on overall input bytes, memory or elapsed parsing time.
