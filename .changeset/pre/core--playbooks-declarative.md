---
"@rizom/brain": patch
---

Playbooks are a declarative service that owns the playbook type. The `playbooks` capability installs both plugins it always had, `playbook` and `playbooks`; the separate `playbook` capability is folded into it, and a brain.yaml that still adds or removes `playbook` is warned about and otherwise ignored. A playbook is stored, updated and exported byte for byte as before, including the defaults it states for an unstated status, audience and completion mode, and onboarding's bundled playbooks seed as before. Stored runs, `playbook_manage`, the agent's context and actions, lifecycle starters and the `playbooks:goalCheck` eval are unchanged; a failed `playbook_manage` call keeps its message and now also carries its code.
