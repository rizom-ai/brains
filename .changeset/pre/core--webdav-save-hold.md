---
"@rizom/brain": patch
---

A save through the WebDAV drive that is kept as a conflict, or stored in another form than it was sent, no longer sends rclone into an endless retry loop. rclone reads a file's size back after every upload and took any other size as a corrupted upload, deleting the file and uploading it again for as long as the drive was mounted. For ten minutes after such a save, the app password that sent it now reads that file as it was sent; every other app password, Studio and the brain have the stored version, and nothing more is stored. The hold ends early once the entity changes again or its conflict is applied or dismissed, and a save made from the held text is kept as another conflict, never written over the newer version.
