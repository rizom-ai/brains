# @brains/ops

## 0.2.0-alpha.257

## 0.2.0-alpha.256

### Minor Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate dependency-free liveness from runtime readiness, expose bounded process and queue health signals, terminate unrecoverable job workers, and add Docker plus restart-budgeted host supervision to generated deployments.

### Patch Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Harden deployed process ownership by draining aborted Git subprocesses, cancelling and awaiting active Git work during directory-sync shutdown, bounding initialization network probes, and running the packaged Brain entry point under `tini`.

## 0.2.0-alpha.255

### Patch Changes

- [#83](https://github.com/rizom-ai/brains/pull/83) [`ed13b92`](https://github.com/rizom-ai/brains/commit/ed13b9229fbed366fcef05e2b92bc92d00288017) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a smoke-only directory-sync stress runner with deterministic regression, load, and stress profiles, structured evidence, safety gates, and independent cleanup.

## 0.2.0-alpha.254

## 0.2.0-alpha.253

## 0.2.0-alpha.252

## 0.2.0-alpha.251

## 0.2.0-alpha.250

## 0.2.0-alpha.249

## 0.2.0-alpha.248

## 0.2.0-alpha.247

## 0.2.0-alpha.246

## 0.2.0-alpha.245

### Patch Changes

- [#76](https://github.com/rizom-ai/brains/pull/76) [`e2fa886`](https://github.com/rizom-ai/brains/commit/e2fa886134594d834582c5b55704e893fcb0988a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep observed pilot status rendering out of desired-state reconciliation and include both passes' changed file paths in `reconcile-all --dry-run` output.

## 0.2.0-alpha.244

### Minor Changes

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Activate the single canonical brain contract: require explicit fixed bundles, scaffold recipes into visible instance configuration with composition-owned profile kinds, consolidate eval and runtime assets with suite-specific fixture directories, compose every registered agent-context provider, remove built-in model/preset selection, and replace versioned fleet formats with one strict canonical desired-state contract. Require exact hosted site and external-theme package pins, add temporary secret-free offline crossover staging, and move onboarding to its model-neutral package. Harden canonical model validation by preserving judge evidence, recording failed tool results, aligning migrated fixtures with canonical tools, and clarifying unmet-request, generation, and playbook-status routing. Eval runs without a locally built database drain seed-content ingestion before running turns; `--build-db` remains the fast path and its databases stay out of version control.

- [#73](https://github.com/rizom-ai/brains/pull/73) [`e1b4422`](https://github.com/rizom-ai/brains/commit/e1b442233e18215f096ea4d758947761ffb4b89c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Prepare the clean brain-model crossover without activating it: add deterministic model/preset migration previews, explicit recipe expansion, a typed canonical model subpath, dormant runner/registry/packed-consumer support, and an opt-in next-schema migration preview for hosted desired state. Legacy runtime and ops loaders remain the only active paths until the coordinated crossover.

## 0.2.0-alpha.243

## 0.2.0-alpha.242

## 0.2.0-alpha.241

## 0.2.0-alpha.240

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. From this release on, `@rizom/brain` and `@rizom/ops` are licensed **AGPL-3.0-only**, while `@rizom/ui` remains **Apache-2.0** as part of the SDK/interface surface. Plugins, themes, and site packages built against the Apache-licensed interfaces (including type imports from `@rizom/brain`) are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

## 0.2.0-alpha.239

## 0.2.0-alpha.238

## 0.2.0-alpha.237

### Minor Changes

- [`c46d46b`](https://github.com/rizom-ai/brains/commit/c46d46b74cfbd48ea557dc07350fe9a882a05acc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Require an explicit themeVersion pin for @rizom-scoped themes in siteOverride. Sites and themes now publish on independent release cadences, so the theme's version can no longer be inferred from the site's — inferring it produced image builds that referenced npm versions that do not exist. Registry loading rejects a @rizom theme without a themeVersion (and a themeVersion on a bundled @brains theme) with a clear per-user error.

## 0.2.0-alpha.236

### Patch Changes

- [`9655faf`](https://github.com/rizom-ai/brains/commit/9655faf210917e322ce2bdce0a95adaabd816a8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace the standalone Email Resend service with an outbound-first Email message interface. Email now owns its channel descriptor and configured Resend provider, Notifications remains channel-agnostic, channel registration is restricted to message-interface plugins, and brain configuration uses `plugins.email`; existing `plugins.email-resend` configuration must be renamed.

## 0.2.0-alpha.235

## 0.2.0-alpha.234

## 0.2.0-alpha.233

## 0.2.0-alpha.232

## 0.2.0-alpha.231

## 0.2.0-alpha.230

## 0.2.0-alpha.229

## 0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`7d18545`](https://github.com/rizom-ai/brains/commit/7d18545696fc5dd3908107cbeecc9bfdc2f17655) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare Anchor profile flavor in brain configuration, project person/team/organization into auth runtime ownership, remove runtime Anchor mutations, and resolve Admin-console names and CMS links from profile entities.

## 0.2.0-alpha.226

### Patch Changes

- [`79795d4`](https://github.com/rizom-ai/brains/commit/79795d4b06d3e8ef76455907f909818f3acc73ac) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an optional per-user `profileKind` to pilot user config, rendered into the instance `brain.yaml` composition. Defaults to `professional` when unset, so existing instances are unchanged; instances that select a catalog kind (e.g. `collective`) now publish the correct anchor category instead of the hardcoded default.

## 0.2.0-alpha.225

### Patch Changes

- [`b0001fb`](https://github.com/rizom-ai/brains/commit/b0001fb102c030855586d92c4abef67004ae7987) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move optional semantic profile kind selection into `brain.yaml`, derive a closed structural category through an app-scoped finalized registry, validate profile persistence with the selected kind schema, and publish the new `{ kind, category }` A2A and ATProto card contract.

## 0.2.0-alpha.224

### Patch Changes

- [`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded, authority-refetched ATProto Jetstream discovery with safe public egress, durable replay state, identity-collision protection, staleness handling, heartbeat publishing, review digests, and per-brain canary configuration.

## 0.2.0-alpha.223

## 0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- [#68](https://github.com/rizom-ai/brains/pull/68) [`5b7f0b5`](https://github.com/rizom-ai/brains/commit/5b7f0b5b0ea7586647d2c3bd98f69b78a4ad0bd6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align preview URL topology across runtime metadata and fleet deployment. Dedicated domains use `preview.<domain>`, while direct sites under the shared `rizom.ai` parent use `<site>-preview.rizom.ai` so both hosts remain covered by one-level wildcard TLS.

## 0.2.0-alpha.220

## 0.2.0-alpha.219

## 0.2.0-alpha.218

## 0.2.0-alpha.217

## 0.2.0-alpha.216

## 0.2.0-alpha.215

## 0.2.0-alpha.214

## 0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- [#65](https://github.com/rizom-ai/brains/pull/65) [`2708fb2`](https://github.com/rizom-ai/brains/commit/2708fb232f4aa2fa2e497a544bca117d31b7c1eb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Default omitted rover-pilot `siteOverride.version` values to each user's effective brain version while preserving explicit exact pins. Document the hosted public site/theme package contract, per-instance image behavior, canary verification, and rollback flow in the scaffolded operator guides.

## 0.2.0-alpha.211

## 0.2.0-alpha.210

## 0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- [`ba3dbab`](https://github.com/rizom-ai/brains/commit/ba3dbab5d25577c17259ebf05506ff1ff4b7f26c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish canonical AT Protocol lexicon schema records from the DNS-designated authority account on startup.

## 0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- [`b138421`](https://github.com/rizom-ai/brains/commit/b1384217bf155b0172c235d62077168d3b8d0586) Thanks [@yeehaa123](https://github.com/yeehaa123)! - secrets:encrypt no longer corrupts long secret values on merge. The merge
  path parsed stored YAML with a flat line-based parser that truncated folded
  scalars (destroying PEM cert pairs); it now uses a real YAML parser, verifies
  the emitted plaintext round-trips byte-identically before encrypting, fails
  loudly on unparseable plaintext or stored payloads, and the scaffolded
  decrypt-user-secrets deploy script rejects non-PEM-shaped TLS values before
  the deploy starts.

## 0.2.0-alpha.205

### Patch Changes

- [`6bc26ff`](https://github.com/rizom-ai/brains/commit/6bc26ffeb782fef8eaae0aa444aa0e824141bbc1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Member handles under the fleet domain: the atproto plugin serves the owner's account DID at /.well-known/atproto-did when accountDid is configured, so a member's Bluesky handle (@<handle>.<domainSuffix>) verifies against their own brain via the HTTP method — no DNS records. Pilot plumbing: users/<handle>.yaml atproto.accountDid flows into the generated brain.yaml plugin config; operator playbook updated.

## 0.2.0-alpha.204

## 0.2.0-alpha.203

## 0.2.0-alpha.202

## 0.2.0-alpha.201

## 0.2.0-alpha.200

## 0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- [`4f70541`](https://github.com/rizom-ai/brains/commit/4f705417d076bf8bdef1c620a6d211a3d1993f0a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add an explicit, per-handle Rover Pilot deploy option for releasing an operator-confirmed stale Kamal lock before retrying. Normal deployments continue to preserve deploy locks by default.

## 0.2.0-alpha.197

## 0.2.0-alpha.196

## 0.2.0-alpha.195

## 0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- [`9374b1e`](https://github.com/rizom-ai/brains/commit/9374b1e040951a3b69b76750fc9c61392c41f7a8) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Parse decrypted pilot secrets as YAML so real long-form certificate and private-key payloads survive folded YAML serialization.

## 0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- [`25ae7bb`](https://github.com/rizom-ai/brains/commit/25ae7bb769072598c3e1e320fa8ed004ebda7c50) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore rover-pilot custom-domain deployment support through per-user age-encrypted TLS overrides, safe real-PEM file encryption, custom preview and `www` aliases, and per-user Cloudflare zone selection.

## 0.2.0-alpha.190

## 0.2.0-alpha.189

## 0.2.0-alpha.188

## 0.2.0-alpha.187

## 0.2.0-alpha.186

## 0.2.0-alpha.185

## 0.2.0-alpha.184

## 0.2.0-alpha.183

## 0.2.0-alpha.182

## 0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- [#59](https://github.com/rizom-ai/brains/pull/59) [`e52ca13`](https://github.com/rizom-ai/brains/commit/e52ca13cf888013687734af3bb39469859d4e23c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add shell-owned recurring checks with deterministic UTC staggering, a shared Effect test clock, cooperative cancellation, startup catch-up, bounded retries, condition-based alert deduplication, and notification delivery. Agent discovery now scans peer directories daily, while generated Rover and fleet configuration reuse the onboarding recipient for recurring alerts.

## 0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- [`b1c4afb`](https://github.com/rizom-ai/brains/commit/b1c4afbe9e1616fb70c99851e76d4a2962cb417e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reconcile the rover-pilot scaffold's deploy scripts with the running pilot pipeline so `brains-ops init` produces what actually deploys. Four scripts adopt live's current form: secret masking + CMS_CONTENT_REPO_PAT in decrypt-user-secrets, the BWS bootstrap token excluded from user-secret validation, the reconcile-aware deploy-handle matcher that keys off users/<h>/brain.yaml (and .env/content/.secrets) rather than the raw registry file, and the main()-wrapped sync-content-repo. (provision-server stays on its plain-access form: live's `?.` optional chaining is redundant under the ops types and functionally identical.) update-dns keeps its richer CNAME-migration form — a strict superset that lets a deploy claim a domain currently held by a CNAME (needed for the rizom.* cutover) — and that version is adopted into the live pilot too. The scaffold retains the per-user ATProto app-password wiring (now via the masked writeSecretGitHubEnv path): outbound publishing is implemented and rizom.ai is its flagship, so this is about-to-be-needed capability the live deploy will wire when publishing is switched on. Init's ATProto staleness detector and the init tests are updated to the new script forms.

## 0.2.0-alpha.177

## 0.2.0-alpha.176

## 0.2.0-alpha.175

## 0.2.0-alpha.174

## 0.2.0-alpha.173

## 0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- [`fccd93d`](https://github.com/rizom-ai/brains/commit/fccd93dff5635d942bcc43c631a26bc1267630ad) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Sync the rover-pilot scaffold templates to the running pipeline design: build.yml resolves the declared image set from the registry and matrix-builds missing images (replacing the batched resolve-build-config design, which leaked every same-version site override into one shared image), deploy.yml waits long enough for a concurrent build and drops the per-step shared-secret plumbing in favor of varlock, and the deploy scripts derive tags through the shared @rizom/ops helpers. Remaining drift in six templated scripts (update-dns, decrypt-user-secrets, resolve-deploy-handles, sync-content-repo, provision-server, validate-secrets) is bidirectional and tracked as a follow-up.

## 0.2.0-alpha.170

### Patch Changes

- [`5c828fd`](https://github.com/rizom-ai/brains/commit/5c828fd6823b582835f5c7892ed2994b322ba603) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `resolveImageBuilds` and `runResolveMissingImages` (also on the `/deploy` entry): the Build workflow's resolve step as ops logic — derive the declared image set from the pilot registry, probe the container registry per tag, and emit the missing ones as a GitHub Actions build matrix, with dispatch inputs forcing a single explicit build. rover-pilot's build.yml becomes a thin caller.

## 0.2.0-alpha.169

### Patch Changes

- [`13efe5c`](https://github.com/rizom-ai/brains/commit/13efe5cb1f15ef694e4634914ffee5d68f57c37a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add image derivation to the ops registry model: `siteImageTag` (moved from rover-pilot's local copy), `sitePackagesFor`, and `requiredImages` — the image set the declared fleet state requires, derived purely from resolved users. This lets rover-pilot's Build workflow build exactly what a config push declares (default image per brain version in use, plus one per-instance sites image per site override) instead of relying on manual dispatches, and lets its deploy resolve tags through the same function so build and deploy can never disagree.

## 0.2.0-alpha.168

## 0.2.0-alpha.167

## 0.2.0-alpha.166

## 0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- [`78ff7f2`](https://github.com/rizom-ai/brains/commit/78ff7f294dadd6e4b830ea0f5a262b0c4ec4b9d1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix new users being skipped by every deploy after onboarding. The reconcile and deploy workflows committed generated output via `git diff`, which is blind to untracked files — so a newly added user's generated `users/<handle>/` directory was silently dropped and never appeared in any commit range the deploy handle-resolver inspects. Both workflow templates now stage generated paths with `git add --intent-to-add` before the diff dance.

## 0.2.0-alpha.163

## 0.2.0-alpha.162

## 0.2.0-alpha.161

## 0.2.0-alpha.160

## 0.2.0-alpha.159

## 0.2.0-alpha.158

## 0.2.0-alpha.157

## 0.2.0-alpha.156

## 0.2.0-alpha.155

## 0.2.0-alpha.154

## 0.2.0-alpha.153

## 0.2.0-alpha.152

## 0.2.0-alpha.151

## 0.2.0-alpha.150

## 0.2.0-alpha.149

## 0.2.0-alpha.148

## 0.2.0-alpha.147

## 0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- [`47d53f6`](https://github.com/rizom-ai/brains/commit/47d53f635551eaa486449173bcea5703df57cf6f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Preserve custom-domain certificate secrets when encrypting rover-pilot user secrets.

## 0.2.0-alpha.144

## 0.2.0-alpha.143

## 0.2.0-alpha.142

### Minor Changes

- [`442a843`](https://github.com/rizom-ai/brains/commit/442a843b07b0ee90a7332df86fc56bc8fb15db37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow docs.rizom.ai to run on Rover by making the docs capability opt-in on Rover, letting hosted user config render additional `add:` capabilities, and installing selected `siteOverride.package@version` refs into hash-tagged rover-pilot fleet images.

### Patch Changes

- [`fcab30b`](https://github.com/rizom-ai/brains/commit/fcab30b062c076b3203f8883ee03babf9cf3d25f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add per-user custom-domain TLS and DNS deploy support for hosted Rover pilot registries.

## 0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- [`f30d603`](https://github.com/rizom-ai/brains/commit/f30d603ef2384df63381227754f8178ef6b88a06) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tech-debt sweep: dashboard CSS extracted to a real stylesheet; deploy scaffolding forks (push-target, run-subprocess, push-secrets, ssh-key-bootstrap) consolidated into @brains/deploy-support with drift-guard tests; atproto-contracts split into modules with the @brains/plugins dependency removed; hackmd, notion, plugin-examples, and mcp-bridge plugins deleted (zero consumers).

## 0.2.0-alpha.139

## 0.2.0-alpha.138

## 0.2.0-alpha.137

## 0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- [`cadc0a6`](https://github.com/rizom-ai/brains/commit/cadc0a661ea7b6704a6b823b596155acf5516874) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a Rover onboarding service plugin that owns bundled onboarding playbooks and registers the first web-chat starter through the playbooks runtime. Playbooks now accepts runtime lifecycle starter registrations, and Rover/ops opt into onboarding through the new plugin config instead of the generic trigger flag.

## 0.2.0-alpha.134

## 0.2.0-alpha.133

## 0.2.0-alpha.132

## 0.2.0-alpha.131

## 0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- [`23b84d7`](https://github.com/rizom-ai/brains/commit/23b84d790412efb428a76d8124ea67f4d52a37fc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow rover-pilot users to opt into the Rover onboarding playbook starter with `playbooks.onboarding: true`, rendering the corresponding `playbooks.triggers.first-anchor-web-chat` brain config.

## 0.2.0-alpha.128

## 0.2.0-alpha.127

## 0.2.0-alpha.126

## 0.2.0-alpha.125

## 0.2.0-alpha.124

## 0.2.0-alpha.123

## 0.2.0-alpha.122

## 0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- [`3b00ca4`](https://github.com/rizom-ai/brains/commit/3b00ca47d33469b6032bf73f603f2fc8e88f61f7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Web-chat-first onboarding. The welcome email now sends users to {{origin}}/chat and frames Rover with the guide's own language; the user onboarding guide is rewritten around the user journey (element inventory, capture → ask back → shape loop, agent network as the loop's second payoff, pilot Discord server for questions and feedback); the operator checklist verifies the chat surface for all presets and treats Discord as a per-cohort extra.

## 0.2.0-alpha.119

## 0.2.0-alpha.118

## 0.2.0-alpha.117

## 0.2.0-alpha.116

## 0.2.0-alpha.115

## 0.2.0-alpha.114

## 0.2.0-alpha.113

## 0.2.0-alpha.112

## 0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- [`057b63b`](https://github.com/rizom-ai/brains/commit/057b63be6f8fdd65611f85049b09705e7ac725d2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Merge existing encrypted per-user secrets during `brains-ops secrets:encrypt` so adding a new secret no longer requires re-entering unchanged secret values such as an existing Discord bot token.

## 0.2.0-alpha.109

### Patch Changes

- [`b2c3550`](https://github.com/rizom-ai/brains/commit/b2c355029c06de6368e70d1832be39c084a276a7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release ATProto smoke credential wiring after the previous alpha version bump: Rover reads the app password from `ATPROTO_APP_PASSWORD`, rover-pilot user config owns the public ATProto identifier, and ops encrypts/deploys only the per-user ATProto app password.

## 0.2.0-alpha.108

## 0.2.0-alpha.107

## 0.2.0-alpha.106

## 0.2.0-alpha.105

## 0.2.0-alpha.104

## 0.2.0-alpha.103

## 0.2.0-alpha.102

## 0.2.0-alpha.101

## 0.2.0-alpha.100

## 0.2.0-alpha.99

## 0.2.0-alpha.98

## 0.2.0-alpha.97

## 0.2.0-alpha.96

## 0.2.0-alpha.95

## 0.2.0-alpha.94

## 0.2.0-alpha.93

## 0.2.0-alpha.92

## 0.2.0-alpha.91

## 0.2.0-alpha.90

## 0.2.0-alpha.89

## 0.2.0-alpha.88

## 0.2.0-alpha.87

## 0.2.0-alpha.86

## 0.2.0-alpha.85

## 0.2.0-alpha.84

## 0.2.0-alpha.83

## 0.2.0-alpha.82

## 0.2.0-alpha.81

## 0.2.0-alpha.80

## 0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- [`5aa339d`](https://github.com/rizom-ai/brains/commit/5aa339d7da43876e0e641567fbf1414387ad440c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make first-passkey setup emails configurable with product-specific onboarding copy, render Rover pilot onboarding copy in generated configs, and update the pilot user guide for the current passkey/OAuth core flow.

## 0.2.0-alpha.77

### Patch Changes

- [`31601f2`](https://github.com/rizom-ai/brains/commit/31601f2a6b669c4cc9a8660811e34e15f5257150) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `verify-user`: parse `/health` response with Zod instead of a cast, collect per-check failures so an early failure doesn't hide later ones, and report passed and failed checks together. Drop the misleading "content repo" claim from the docs.

## 0.2.0-alpha.76

### Patch Changes

- [`fe7c610`](https://github.com/rizom-ai/brains/commit/fe7c6101ec5a4ac21966788128ee0d9f3f7fde5c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `brains-ops verify-user <repo> <handle>` to check deployed Rover health, unauthenticated MCP auth gating, and default-preset browser/CMS routes during canary verification.

## 0.2.0-alpha.75

### Patch Changes

- [#6](https://github.com/rizom-ai/brains/pull/6) [`60b5632`](https://github.com/rizom-ai/brains/commit/60b5632ee9d98a95e577d3a9574fd67b87d99b4c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a manual `brain_version` input to the generated rover-pilot Build workflow so operators can build smoke or cohort override runtime versions without changing `pilot.yaml`.

## 0.2.0-alpha.74

## 0.2.0-alpha.73

## 0.2.0-alpha.72

### Minor Changes

- [`e7e4205`](https://github.com/rizom-ai/brains/commit/e7e4205282726e6c092841bc4a4c9a6b9d35efdf) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Auth-service can now request passkey setup emails via the notifications router, with persistent dedupe keyed to the active setup token (SHA-256 hashed at rest, 0o600). Rover bundles the setup email delivery plugins by default, and brains-ops renders `setup.delivery: email` configuration for pilot users — including the required `SETUP_EMAIL_API_KEY` and `SETUP_EMAIL_FROM` GitHub Secrets.

## 0.2.0-alpha.71

## 0.2.0-alpha.70

## 0.2.0-alpha.69

## 0.2.0-alpha.68

## 0.2.0-alpha.67

## 0.2.0-alpha.66

## 0.2.0-alpha.65

## 0.2.0-alpha.64

## 0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- [`697394f`](https://github.com/rizom-ai/brains/commit/697394f96cf828eca5512cc06c2386b829276212) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated publish-image Docker actions to Node.js 24-compatible major versions.

## 0.2.0-alpha.61

### Patch Changes

- [`4a65833`](https://github.com/rizom-ai/brains/commit/4a65833f1d6380d4348bfdd547e7714c33a41621) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Upgrade generated deploy workflow checkout action to avoid Node.js 20 action runtime warnings.

## 0.2.0-alpha.60

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- [`5f4b816`](https://github.com/rizom-ai/brains/commit/5f4b8168d39b45eeb58840a9503c42cea97ad44c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the embedded Brain OAuth/passkey provider for MCP HTTP and operator sessions.

  Rover now includes `auth-service` by default, serves OAuth discovery/JWKS/protected-resource metadata, supports dynamic client registration and PKCE authorization-code flow, persists signing keys/clients/codes/sessions/passkeys/refresh tokens under runtime auth storage, and lets OAuth-capable MCP clients authenticate through browser/passkey login with the `mcp` scope.

  `MCP_AUTH_TOKEN` remains available as a deprecated static fallback. The CLI adds `brain auth reset-passkeys --yes` for local break-glass passkey recovery, onboarding docs now cover first-run `/setup`, and generated deploy templates persist `/app/data` so `./data/auth` survives redeploys outside `brain-data`.

## 0.2.0-alpha.54

## 0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- [`d8649c3`](https://github.com/rizom-ai/brains/commit/d8649c327ee659fada1bcd33e02af8e5d9916148) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the `@rizom/ops` packed-tarball smoke test out of per-commit CI into the Release workflow's pre-publish step. The test (build + npm pack + bun add + multiple CLI subprocess invocations) was hitting the 20s default timeout on congested runners and blocking unrelated changes from publishing. It now runs only when `RUN_SMOKE_TESTS=1` is set, gated to the actual publish step where its end-to-end "the published artifact works for external consumers" guarantee is most valuable.

## 0.2.0-alpha.51

## 0.2.0-alpha.50

## 0.2.0-alpha.49

## 0.2.0-alpha.48

## 0.2.0-alpha.47

## 0.2.0-alpha.46

## 0.2.0-alpha.45

## 0.2.0-alpha.44

## 0.2.0-alpha.43

## 0.2.0-alpha.42

## 0.2.0-alpha.41

## 0.2.0-alpha.40

## 0.2.0-alpha.39

## 0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- [`d0970f6`](https://github.com/rizom-ai/brains/commit/d0970f692e232d12698ffef4e2aca1338205a013) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix published deploy scaffolding so both CLIs generate deploy files from the shared template source instead of stale package-local copies.

  This keeps standalone and rover-pilot scaffolds aligned with the shared deploy templates, including the persistent runtime mounts for `/data`, `/config`, and `/app/dist`.

## 0.2.0-alpha.36

## 0.2.0-alpha.35

## 0.2.0-alpha.34

## 0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- [`4b5c628`](https://github.com/rizom-ai/brains/commit/4b5c6288c766b2c0acd77bbb96ac2556fe82f619) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the rover-pilot deploy scaffold so deploys can run after Reconcile-generated config commits. The generated Deploy workflow now listens for successful Reconcile runs on `main`, the generated handle resolver supports `workflow_run` events, and rerunning `brains-ops init` upgrades older pilot repos that still have the stale pre-fix workflow and resolver templates.

## 0.2.0-alpha.31

## 0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- [`700994f`](https://github.com/rizom-ai/brains/commit/700994f91babcb4d1d7e4f137689ef333e5c80c3) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve CMS defaults and rover-pilot onboarding guidance.
  - fix `@brains/admin` `/cms` bootstrapping so Sveltia uses the inline config instead of failing to fetch a missing config file
  - make the base entity default to `Note` / `Notes` in `@brains/cms-config` when no explicit display override is provided
  - update the published `@rizom/ops` rover-pilot onboarding docs to frame Discord, Dashboard, and CMS as the default experience, with Git, Obsidian, and MCP as optional workflows

## 0.2.0-alpha.28

### Patch Changes

- [`9bc790c`](https://github.com/rizom-ai/brains/commit/9bc790c3063196c06e628c85c7cfc0000bef5f95) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Update `brains-ops secrets:encrypt` to prefer `users/<handle>.secrets.yaml`, auto-create that plaintext per-user secrets file when required values are missing, and keep environment-variable fallback for compatibility.

## 0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- [`48a0ff8`](https://github.com/rizom-ai/brains/commit/48a0ff8d9092898fdf1d476af829598eb9fa3129) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the rover-pilot generated deploy and reconcile workflows so generated config commits rebase onto the latest branch tip before pushing, and let `brains-ops init` reconcile the older direct-push workflow shape on rerun.

## 0.2.0-alpha.25

### Patch Changes

- [`c6ec96d`](https://github.com/rizom-ai/brains/commit/c6ec96d98ceee54acfb7c5ac5f1141d011b78286) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Broaden rover-pilot deploy Dockerfile reconciliation so `brains-ops init` upgrades older Caddy-based Dockerfiles even when packaged runtime formatting drift would otherwise prevent an exact legacy-content match.

## 0.2.0-alpha.24

## 0.2.0-alpha.23

## 0.2.0-alpha.22

## 0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- [`628c908`](https://github.com/rizom-ai/brains/commit/628c90859ec4b6f906d1c30cedd0da33829bd477) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Converge the in-repo runtime and deploy path on the shared-host model: local app `src/site.ts` / `src/theme.css` conventions now resolve consistently in the monorepo runner, in-repo apps use the workspace `@rizom/brain`, and the legacy dedicated preview server on port `4321` is removed so preview stays on the shared HTTP host.

## 0.2.0-alpha.19

### Patch Changes

- [`39774de`](https://github.com/rizom-ai/brains/commit/39774def181d2f5d3eaaa1ee26e087c0e8a873d1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix deploy Caddy templates to match preview hosts reliably using a Host header regex that supports both `preview.<domain>` and `*-preview.*` host shapes.

  Also remove the root-to-agent-card redirect from the generic site deploy templates so deployed site homepages continue serving the site root instead of redirecting to A2A discovery.

  Add regression coverage for the generated Caddy templates in both the brain CLI and ops scaffolds.

## 0.2.0-alpha.18

## 0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- [`db41123`](https://github.com/rizom-ai/brains/commit/db411235976b9896cb0b77bd09f218714acefa3c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align preview domain routing across deploy paths.
  - Derive preview URLs consistently from the configured brain domain
  - Support both `preview.<domain>` and `*-preview.*` preview host shapes in deploy Caddy templates
  - Add regression coverage for preview URL derivation and preview host routing

## 0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- [`44b03e3`](https://github.com/rizom-ai/brains/commit/44b03e3e560fb17b97b9cf7178c0e2084b9d818e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore `brains-ops secrets:push <repo>` as a shared GitHub Actions secret sync command so operators can push repo-wide pilot secrets like `GIT_SYNC_TOKEN` and `MCP_AUTH_TOKEN` from local env files without hand-written `gh secret set` calls.

## 0.2.0-alpha.13

### Patch Changes

- [`5798b3b`](https://github.com/rizom-ai/brains/commit/5798b3bc70be7475a4fad26c4dab0323d602077b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace rover-pilot's per-user GitHub secret push flow with age-encrypted checked-in user secret files, add `brains-ops age-key:bootstrap` and `brains-ops secrets:encrypt`, and update the published deploy scaffold to decrypt per-user overrides while falling back to shared pilot secret selectors.

## 0.2.0-alpha.12

### Patch Changes

- [`30cce87`](https://github.com/rizom-ai/brains/commit/30cce876daba182fdf1063506d4662692873d5fe) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Seed a per-user `anchor-profile` into new Rover content repos and sync generated content seeds through the pilot deploy workflow.

## 0.2.0-alpha.11

### Patch Changes

- [`cf353fd`](https://github.com/rizom-ai/brains/commit/cf353fd41279a1ab59ab5ecd07dee9b1bcfd98dc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Restore an explicit Caddy redirect from `/` to `/.well-known/agent-card.json` so core-only deployments never return a bare 502 on the root path.

## 0.2.0-alpha.10

### Patch Changes

- [`afd89a0`](https://github.com/rizom-ai/brains/commit/afd89a011595edccab23ed761dda92517ee9d806) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the generated rover-pilot deploy workflow so its final generated-config commit can push successfully from GitHub Actions checkout state.

## 0.2.0-alpha.9

### Patch Changes

- [`676b2c1`](https://github.com/rizom-ai/brains/commit/676b2c15d4a696b400783ad5c46325c7990d9154) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix deployed smoke routing so the container healthcheck goes through Caddy, core-only root requests no longer fail when no site webserver is running, and GET `/a2a` returns a helpful non-404 response.

## 0.2.0-alpha.8

### Patch Changes

- [`ddf17de`](https://github.com/rizom-ai/brains/commit/ddf17def0015d19da2647ca42417c93b7c80fe4e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Sync the shared Kamal deploy template into both published packages so deployed scaffolds use the same package-local runtime copy after install, and align the rover-pilot scaffold with preview host routing.

## 0.2.0-alpha.7

### Patch Changes

- [`b7eb35c`](https://github.com/rizom-ai/brains/commit/b7eb35cee36e1bb1742dcf99af0510f490e5a5cb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix published deploy scaffolds to use package-local deploy templates and sync shared Docker/Caddy sources into both published packages at build time.

## 0.2.0-alpha.6

### Patch Changes

- [`a9c2fbd`](https://github.com/rizom-ai/brains/commit/a9c2fbd4baba6a45a08580177ca8d62fe7875179) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `brains-ops render` fill rover-pilot status columns from built-in live probes for DNS, `/health`, and unauthenticated `/mcp` reachability.

## 0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- [`6067211`](https://github.com/rizom-ai/brains/commit/60672115d53b6c53b0ed04b2517f2252a80c9d27) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add private `brains-ops ssh-key:bootstrap` and `brains-ops cert:bootstrap` commands for rover-pilot operator bootstrap, and share the Origin CA helper boundary used by `@rizom/brain`.

## 0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- [`335dd77`](https://github.com/rizom-ai/brains/commit/335dd770538c84f289c96ea4cf33f218b214bcb4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add `brains-ops secrets:push <repo> <handle>` for pilot GitHub secret delivery, reusing the CLI-style local env and file-backed secret resolution contract.

## 0.2.0-alpha.1

### Patch Changes

- [`8e39eb7`](https://github.com/rizom-ai/brains/commit/8e39eb78a6927246326262a5ebf1628f8b14e546) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Republish the fixed public package set on the corrected 0.2.x alpha line so installed `@rizom/ops` and `@rizom/ops/deploy` match the repaired artifact.

## 1.0.1-alpha.17

### Patch Changes

- [`9040ba0`](https://github.com/rizom-ai/brains/commit/9040ba04d1c0604314d6138bb292231347387464) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the published `@rizom/ops` package so the installed CLI can scaffold deploy helpers without monorepo-only imports, and the `@rizom/ops/deploy` export resolves correctly from npm.

## 0.2.0-alpha.0

### Minor Changes

- [`e5320f3`](https://github.com/rizom-ai/brains/commit/e5320f3fc5db5147b31c1748af9842ada8c5ae8d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Make `@brains/ops` publishable and update the `brains-ops init` scaffold to install and invoke the published package from `rover-pilot` workflows instead of checking out the `brains` monorepo at runtime.
