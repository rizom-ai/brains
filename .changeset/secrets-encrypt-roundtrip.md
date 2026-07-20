---
"@rizom/ops": patch
---

secrets:encrypt no longer corrupts long secret values on merge. The merge
path parsed stored YAML with a flat line-based parser that truncated folded
scalars (destroying PEM cert pairs); it now uses a real YAML parser, verifies
the emitted plaintext round-trips byte-identically before encrypting, fails
loudly on unparseable plaintext or stored payloads, and the scaffolded
decrypt-user-secrets deploy script rejects non-PEM-shaped TLS values before
the deploy starts.
