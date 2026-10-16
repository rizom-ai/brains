---
"@rizom/brain": patch
---

Update the public UI's Markdown sanitizer to sanitize-html 2.18.0 and its required HTML-parser dependencies. Apply the existing per-image URL scheme policy to srcset candidates, preserve content after browser-style comment and textarea terminators, and escape raw-text markup instead of turning it into allowed elements.

Keep the existing tag, attribute and URL allowlists, renderer-output sanitization and internal image references. Noscript remains an unwrapped, sanitized fallback rather than gaining a new content-discard policy. The newer HTML parser stays nested under the sanitizer; unrelated parser consumers retain their existing versions. This dependency update is not a browser/PDF execution acceptance, network-fetch restriction, resource bound or clean-security-audit claim. No release-version bump or hosted rollout is included.
