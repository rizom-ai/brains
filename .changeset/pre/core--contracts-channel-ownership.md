---
"@brains/contracts": patch
"@brains/plugins": patch
"@brains/newsletter": patch
"@brains/conversation-service": patch
"@brains/portfolio": patch
"@brains/blog": patch
"@brains/series": patch
"@brains/social-media": patch
"@brains/playbooks": patch
---

Move single-owner message channel groups out of the shared contracts barrel to
the packages that own them, and delete the shell/plugins re-export barrel so
consumers import channels from their source.
