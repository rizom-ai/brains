---
"@brains/webdav": patch
"@rizom/brain": patch
---

Saving a file on the drive with neovim no longer deletes it. neovim renames the file to its backup name (`note.md~`) before writing it anew, and when the drive refused that rename it copied the file and deleted the original, which deleted the entity. A rename of an entity's file onto a temporary name is now taken as that backup: the bytes are copied to the person's temporary files and the entity stays, for the save that follows to replace.
