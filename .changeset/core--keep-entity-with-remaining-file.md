---
"@brains/directory-sync": patch
---

Removing one file of an entity no longer deletes the entity while another of its files remains, such as an image's `.png` beside a leftover `.jpg`. The entity is kept and the remaining file is imported, so it becomes the entity's content. Before, deleting the leftover file from the content repository deleted the image itself on the next pull.
