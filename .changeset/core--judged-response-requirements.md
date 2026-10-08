---
"@brains/ai-evaluation": minor
"@rizom/brain": patch
---

Eval success criteria accept `responseCriteria`: plain-language requirements on what a reply conveys, judged for meaning rather than wording, all of a turn's requirements in one judge call. An unmet requirement fails the case with the judge's reason. Requirements the run could not judge (judge skipped, unavailable, or an incomplete verdict) are listed on the result and in the console report instead of passing silently.

The bundled eval cases replace keyword checks on model wording with judged requirements that keep each check's intent: concept words, synonym lists such as verify/contact/reach, and single-word guards such as "deleted", "saved" or "done" that also match a correct refusal ("it can't be deleted"). Checks on host-produced text and on facts from seed content or tool results stay exact. A case no longer forbids a write attempt that runtime policy refuses; it requires the reply to decline without claiming the change.
