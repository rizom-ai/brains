---
"@brains/webdav": patch
"@rizom/brain": patch
---

Saving a file through an rclone mount no longer deletes it when the drive refuses the save or stores it in another form. rclone takes such a save as a failed upload and deletes the file to clean up; the drive now answers that one delete with 409 and keeps the entity. A second delete, or one naming the version with `If-Match`, still deletes the file.
