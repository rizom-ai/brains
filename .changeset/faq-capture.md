---
"@rizom/brain": patch
---

Add the FAQ plugin to the chat bundle: reusable question-and-answer pairs from chats are captured as draft `faq` entities at the visibility of the turn that answered them, and a repeated question counts against the existing FAQ of the same visibility. Published public FAQs are available to sites as the `faq-section` template, which each site places itself. Guest conversations are never captured.
