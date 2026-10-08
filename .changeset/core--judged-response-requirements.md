---
"@brains/ai-evaluation": minor
"@rizom/brain": patch
---

Eval success criteria accept `responseCriteria`: plain-language requirements on what a reply conveys, judged for meaning rather than wording, all of a turn's requirements in one judge call. An unmet requirement fails the case with the judge's reason. Requirements the run could not judge (judge skipped, unavailable, or an incomplete verdict) are listed on the result and in the console report instead of passing silently.

The bundled eval cases replace keyword checks on model wording (concept words, synonym lists such as verify/contact/reach, and the cover-follow-up phrase guards that misfired on correct negated replies) with judged requirements that keep each check's intent. Checks on host-produced text and on facts from seed content or tool results stay exact.
