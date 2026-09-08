---
"@brains/plugins": minor
"@brains/sdk": minor
"@brains/directory-sync": patch
---

Running a brain is not part of extending one

Every service's setup context carried the process role, the git broker's
whereabouts, and a mirror of every entity type. One package uses them. For every
other author they sat in autocomplete, teaching that process roles are part of
the model they were learning.

A package that _is_ infrastructure names the `infrastructure` token in its
declaration and its setup is given those facts under one field. Leave the token
out — which all ordinary authoring does — and the field's type is `undefined`,
so the facts are absent rather than present and undocumented. The token, its
shape, `ServiceRole` and `ServiceGitBroker` are advanced contracts with
directory-sync named; `dataDir` stays ordinary, because writing files is not
infrastructure and Studio's upload staging uses it.
