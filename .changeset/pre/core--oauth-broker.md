---
"@brains/oauth-broker": patch
"@brains/linkedin-import": patch
"@brains/contracts": patch
"@brains/utils": patch
"@rizom/brain": patch
---

A new opt-in `oauth-broker` plugin lets brains connect LinkedIn without their own LinkedIn app. One central brain holds the shared app and its single callback; each instance brain configures `plugins.linkedin-import.broker` (`url`, `instanceId`, `secret`, `returnUri` ending at `/linkedin/oauth/broker/return`) in place of `oauth`. Connecting starts at the broker, LinkedIn returns to the broker, and the broker sends the owner back with a two-minute, single-use grant that only that instance can redeem for the token. Each instance may start ten connections per ten minutes.
