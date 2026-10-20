---
"@rizom/brain": patch
---

Guest chat now tells visitors, with the composer, that their questions are kept for the site's owner, for how long, and that deleting the conversation does not delete them, and records a question's text in the owner's usage record only when the visitor was shown that notice. The notice is composed from the guest policy's `usageRecord` retention and returned by the guest session with a revision; the standalone Ask page and the shared Ask box show it as a visible line that describes the question field, and each question carries the revision it was shown. Question text is kept within the policy's new required `usageRecord.questionBytes`, cut on a character boundary and marked when cut; the presets keep 16,000 bytes.
