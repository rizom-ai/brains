---
"@rizom/ops": patch
---

Update `brains-ops secrets:encrypt` to prefer `users/<handle>.secrets.yaml`, auto-create that plaintext per-user secrets file when required values are missing, and keep environment-variable fallback for compatibility.
