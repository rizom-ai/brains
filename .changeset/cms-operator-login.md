---
"@brains/cms": patch
"@brains/cms-config": patch
---

Add Sveltia-compatible CMS operator login routes for GitHub OAuth and passkey-gated PAT flows, plus explicit `auth_endpoint` generation in CMS config. A brain enables one login method at a time; configuring both is a config-time error.
