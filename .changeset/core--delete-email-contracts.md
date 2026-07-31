---
"@brains/plugins": patch
"@brains/email": patch
"@brains/notifications": patch
---

Route notifications through the channel delivery registry instead of a
transport-specific `email:send` channel, and delete `@brains/email-contracts`.
`ChannelDeliveryInput` gains optional `html` and `sensitivity`, so one
mechanism now covers both invitation and notification delivery.
