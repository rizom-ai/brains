---
"@brains/plugins": patch
"@rizom/brain": patch
---

A service template is one declaration, whatever it can do. The `views` slot is gone: a template in `templates` formats a value with `format`, renders it with `renderers.web`, or both, with an optional `description`, instead of a same-name view repeating its schema. A template that neither formats nor renders is refused, as is a generation template that does not format, and the types refuse a renderer for a schema that does not produce JSON. A behavior slot the service does not have, such as `views`, is refused rather than ignored.
