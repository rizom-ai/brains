---
"@rizom/brain": patch
"@brains/faq": patch
---

A duplicate FAQ folds whichever of the pair's reconcile jobs confirms it. Each FAQ's reconcile job asks the model whether its nearest neighbor asks the same question, but only the newer FAQ's job could fold the pair: when the older FAQ's check said "same", that verdict was dropped, and because the verdict varies a real duplicate pair folded only about two times in three. Either job now folds the pair, always the newer draft into the older one, or a draft into a published FAQ; when both jobs fold at once, one folds and the other finds the pair changed and writes nothing. A published FAQ still never folds or is deleted.
