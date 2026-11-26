---
"@brains/matrix-server": patch
"@brains/chat": patch
"@brains/contracts": patch
"@brains/deploy-support": patch
"@rizom/brain": patch
---

The brain provisions its own Matrix homeserver: nobody sets a Matrix secret. `matrix-server` writes the homeserver's configuration and secrets into the directory it shares with the homeserver (`MATRIX_DATA_DIR`), keeps them across restarts, and answers the bot's credentials over `matrix:bot-credentials`, which the chat interface asks for when its config names no password. Chat keeps trying to start until the bot can log in, so a homeserver that comes up after the brain is picked up without a restart. A deploy whose brain.yaml includes the `matrix` bundle runs Tuwunel as a Kamal accessory on `/opt/brain-matrix`, restarts it when the brain writes it a new configuration, and takes an online backup of it before each deploy. The homeserver now listens on port 6167; `MATRIX_REGISTRATION_TOKEN` and `MATRIX_OIDC_CLIENT_SECRET` are gone.
