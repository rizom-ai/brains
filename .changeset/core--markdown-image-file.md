---
"@rizom/brain": patch
---

An image kept as a markdown file holding its data URL (`image/<id>.md`) now stays where it is. Directory sync's orphan cleanup and export no longer take the image's file to be the binary file its bytes' format names, so a restart no longer deletes the image, and an export writes the data URL back into the markdown file instead of replacing it with a binary file. Cleanup after a pulled deletion of such a file also clears the pending deletion.
