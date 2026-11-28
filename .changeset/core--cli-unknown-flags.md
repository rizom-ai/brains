---
"@rizom/brain": patch
---

The `brain` CLI rejects flags a command does not take, instead of dropping them.

- An unknown or removed flag, such as `brain start --cli`, stops with an error that names the flag and the command, suggests the closest flag when one is near, and points to `brain <command> --help`.
- Each command takes the global flags (`--remote`, `--token`, `--preview`, `--outputDir`, `--help`, `--version`) and its own. `brain eval` still passes its flags to the eval runner.
- The `--remote` refusal on built-in commands gives `brain status --remote <url>` as its example, a command with the same name locally and remotely.
