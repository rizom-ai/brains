---
"@rizom/brain": patch
---

Add the FAQ plugin to the chat bundle: reusable question-and-answer pairs from chats are captured as draft `faq` entities at the visibility of the turn that answered them, and a repeated question counts against the existing FAQ of the same visibility. Published public FAQs are available to sites as the `faq-section` template, which each site places itself. Differing answers from repeated questions are kept as alternatives, which the owner settles in the new FAQ review workspace in Studio. Guest conversations are never captured. Capture can be switched off with `plugins.faq.enabled: false`, same-question matches are shortlisted by a configurable distance (`sameQuestionDistance`) and confirmed by a short AI check so opposite questions never merge, and duplicate FAQs captured moments apart are folded together once they are embedded.
