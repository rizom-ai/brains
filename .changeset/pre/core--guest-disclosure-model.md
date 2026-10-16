---
"@brains/web-chat": patch
"@brains/plugins": patch
---

The default guest disclosure names the provider and model this runtime actually sends guest text to, for both the local-test preset and the owner-activated hosted policy. Previously it always said "OpenAI (gpt-5.6-luna)" and "reach this Brain and OpenAI", whatever model was configured. The preset is resolved at registration against the runtime model and stays closed until then; operator-authored policies keep their own disclosure.
