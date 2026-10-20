---
"@rizom/brain": patch
---

Harden standalone deploy workflows for fresh servers.

- write an explicit SSH client config for Actions deploy runs so Kamal and plain `ssh` use the intended key noninteractively
- wait for SSH access after provisioning before starting Kamal on a newly created Hetzner server
