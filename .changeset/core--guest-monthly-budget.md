---
"@rizom/brain": patch
---

Managed guest chat is limited by a monthly budget the owner sets, not by counts of sessions or questions. The owner opens guest chat in Studio's Guest chat workspace with a budget in US dollars ($0.50 to $10,000), confirmed before it applies; the same form changes it while open. Each question reserves a $0.50 quote until its cost is measured from the provider's reported usage, and the unused part returns to the budget; unknown cost keeps the whole quote. The budget covers one UTC month. The activation endpoint still accepts only `{ enabled }` and reopens with the budget set in Studio. The preview preset's session and question counts become flood limits sized far above normal use (the old four sessions a day, deployment-wide, shut out everyone). The two-question lifetime trial is retired: a deployment that had guest chat on must open it again with a budget.
