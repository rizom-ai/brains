---
"@rizom/brain": patch
---

The contact plugin declares the site's `/contact` and `/contact/thanks` pages in every process. A deployment builds its site in a separate worker, which was never told about them, so the built site had no contact page and the form fell back to its own page.
