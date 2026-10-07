---
"@rizom/brain": patch
---

Copy bundled Guest Ask and dashboard assets from the CLI build's caller-owned staging directory instead of requiring pre-existing dependency outputs. Build the public UI dependency before architecture and console visual checks so those commands also work from clean checkouts.
