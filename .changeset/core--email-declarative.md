---
"@rizom/brain": patch
---

Email is a declarative interface. It registers the same email channel, sends through Resend when it is configured (in background jobs too), listens on the IMAP mailbox as `email:email`, answers source reads for Admins, and keeps reading the IMAP cursor and source locators it stored before.
