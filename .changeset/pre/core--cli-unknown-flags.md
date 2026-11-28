---
"@rizom/brain": patch
---

The `brain` CLI rejects flags a command does not take, instead of dropping them.

- An unknown or removed flag, such as `brain start --cli`, stops with an error that names the flag and the command, suggests the closest flag when one is near, and points to `brain <command> --help`.
- Each command takes the global flags (`--remote`, `--token`, `--help`, `--version`) and its own. `brain eval` still passes its flags to the eval runner.
- A brain-specific command also takes a flag for each input field of its tool, such as `brain build --environment preview`; a switch field takes the flag alone. Before, such a flag was dropped and its value read as the next argument. Once the brain has found the tool, a flag that names none of its fields is refused, with the nearest field suggested.
- `--preview` is a flag of brain-specific commands whose tool has an `environment` input: `brain build --preview` builds the preview site, as `brain build preview` does. Before, it reached no tool input and did nothing. Built-in commands, and brain-specific commands without an environment, now refuse it.
- `--outputDir` is gone: no brain command took it. The site builder writes where its plugin config says.
- The `--remote` refusal on built-in commands gives `brain status --remote <url>` as its example, a command with the same name locally and remotely.
