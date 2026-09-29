---
"@rizom/brain": patch
---

Fix the no-JavaScript contact form rejecting legitimate submissions: its pages sent `Referrer-Policy: no-referrer`, so browsers posted the form with `Origin: null` and the strict origin check refused it. The pages now use `same-origin`, which keeps referrers from leaving the site while identifying same-origin posts. The retention notice also reads "1 day" instead of "1 days".
