---
"@rizom/brain": patch
---

Share server runtime chunks between the CLI and public model imports to avoid loading duplicate runtime graphs in authored brains. Keep chunks beside package-owned migrations, UI assets, onboarding content and native worker artifacts; browser contracts and the Git broker remain separate builds.
