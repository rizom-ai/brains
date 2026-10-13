---
"@brains/studio": minor
"@brains/contracts": minor
"@brains/email": minor
"@brains/email-workflows": minor
"@brains/plugins": minor
"@rizom/brain": patch
---

Add the shared inbound-email source reference contract and the opt-in email-workflows capability. Meaningful inbound mail is conservatively filtered, classified into a restricted derived mail item, persisted before acknowledgement, and retried with a safe unclassified fallback without copying mailbox content into Brain storage or logs. Admins can review the derived queue through a typed CMS workspace, a combined-filter tool, status actions, and a compact dashboard contribution.
