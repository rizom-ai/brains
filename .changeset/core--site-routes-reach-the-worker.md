---
"@rizom/brain": patch
---

The site builder's route registry hears the pages plugins declare in the worker process too. The site builds in the worker, which takes no ordinary message subscriptions, so pages registered through the site builder's channel — the contact form's — were missing from every built site while the serving process listed them.
