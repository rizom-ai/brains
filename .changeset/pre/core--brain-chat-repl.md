---
"@rizom/brain": patch
---

`brain chat` from the installed package opens the chat REPL. The bundled runtime asked for the terminal interface through an option the app never read, and the app only looked for `--cli` on the command line, which `brain chat` does not carry, so the command booted the brain without its REPL. The bundled runtime now asks the app for the terminal interface directly.
