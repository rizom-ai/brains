---
"@brains/contracts": patch
"@brains/notifications": patch
"@brains/contact": patch
---

`notifications:send` answers a refusal as data instead of failing: `{ status: "failed", failure: "recipient-missing" | "transport-missing" | "delivery-failed", transportCode? }`, validated by the shared contract, with a transport's short failure code kept only when it carries no free text. A fault in a transport still fails the request. Contact reads the reason from the answer rather than matching the failure's message text, and `notificationFailureCode` is gone.
