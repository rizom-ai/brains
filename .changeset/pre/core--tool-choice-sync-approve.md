---
"@brains/directory-sync": patch
"@brains/agent-discovery": patch
"@rizom/brain": patch
---

The agent saves a file attached in chat with system_create instead of first syncing the content directory: directory_sync now covers only the brain's content directory and says a chat upload is not in it. Approving or archiving a contact named by its domain is one system_update on that id, with no search, get or list first.
