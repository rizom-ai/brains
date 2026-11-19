---
"@brains/image-plugin": patch
"@brains/plugins": patch
"@rizom/brain": patch
---

Public images get alt text that describes them. As soon as a public image is ready, or a restricted one is made public, and its alt text is still a stand-in (a title, a prompt's start, `cover-<post>`), the brain queues `image:image-describe`; at start-up it queues the public images already there that still carry one. Alt text someone rewrites, in Studio or through the agent, becomes the owner's and is never replaced. A brain with no model that reads images queues nothing.
