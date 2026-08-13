---
"@brains/plugins": patch
"@rizom/brain": patch
---

Hold the account-settings secret boundary in the type system and refuse operator declarations until their runtime exists. Settings reaching a widget, workspace, or action now omit every field declared `secret`, since operator data is serialized to the browser, and each settings schema field must carry a field declaration so `secret` is a decision rather than an omission. A service declaring account settings, dashboard widgets, or CMS workspaces now fails to install with a message naming the missing runtime instead of registering nothing, matching how an account-bound daemon already refuses.
