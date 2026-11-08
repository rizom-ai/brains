---
"@rizom/brain-ui": patch
"@rizom/brain": patch
---

`formatDate` formats in the UTC time zone as well as the `en-US` locale, so a site build renders the same dates wherever it runs. A date-only value such as `2026-03-14` was the day before on a machine west of UTC, and a time near midnight rolled over east of it. Deployed builds already ran in UTC and render as before.
