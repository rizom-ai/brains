# @brains/contracts

## 0.2.0-alpha.244

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.244

## 0.2.0-alpha.243

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.243

## 0.2.0-alpha.242

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.242

## 0.2.0-alpha.239

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.239

## 0.2.0-alpha.238

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.238

## 0.2.0-alpha.237

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.237

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.236

## 0.2.0-alpha.235

### Patch Changes

- [`31e732a`](https://github.com/rizom-ai/brains/commit/31e732a79a394a4e385ce7b25015c3daa8bf0afd) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render site builds into isolated generation directories, validate a complete artifact manifest, and publish successful generations through an active-output symlink. Preserve the previous site on renderer, validation, and pointer-switch failures. Generate RSS and SEO files in staging so post-build events do not mutate committed generations. Snapshot binary app `public/` files during preparation within a bounded size budget and account for them explicitly in the artifact manifest. Stamp the one-time migration backup at migration time and retire it through the stale sweep once a committed generation exists to roll back to. Cancel superseded and shutdown builds across preparation, image work, rendering, CSS, assets, and SEO without interrupting an admitted output commit. Preserve each environment's configured public URL in staged RSS, robots, and sitemap output. Hash every committed artifact, derive sitemap timestamps from the prepared snapshot, and remove stale uncommitted generations safely. Keep the schema-complete build manifest out of the public site while continuing to serve legitimate dot-prefixed paths such as `/.well-known/` discovery and verification assets. Fail a build whose staged artifacts could not be written, so a swallowed RSS failure can no longer publish a generation with no feed, and reject a deployed production build that has no configured site URL instead of publishing sitemap, robots, and feed links against a placeholder domain. Use the runtime's explicit localhost URL for locally served builds so production-output verification still works without configuring a public domain.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.235

## 0.2.0-alpha.234

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.234

## 0.2.0-alpha.233

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.233

## 0.2.0-alpha.232

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.232

## 0.2.0-alpha.231

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.231

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.228

## 0.2.0-alpha.227

### Minor Changes

- [`f7b3500`](https://github.com/rizom-ai/brains/commit/f7b350042c5bbcd6c5a43016d25e95e35ea3bfed) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Separate Admin authorization from Anchor ownership. Permission roles now use only `admin`, `trusted`, and `public`; a generated auth migration converts historical role rows and persists one person-or-collective brain Anchor. Principals expose `isAnchor` independently, personal Anchors must remain active Admins, collective brains can be run by any active Admin, and last-active-Admin protection stays atomic. Propagate both facets through authenticated and configured A2A, evaluation, chat, Discord, MCP, CLI, web-chat, action, tool, confirmation, and model-instruction contexts.

  Finish the standalone Admin console target model with an Anchor ownership card, Admin/Anchor member facets, profile and optional peer-brain sections, responsive roster/detail layouts, typed Anchor mutations, and a console-local TanStack Query cache with targeted mutation invalidation.

- [`fa8e4eb`](https://github.com/rizom-ai/brains/commit/fa8e4eb3a237aaec54eeeb815f68e792d3a1715b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Persist exact interface grants and Anchor bindings in private auth runtime storage, seed declarations only on first initialization, make connected accounts authoritative, keep the no-login channel allowlist out of the person-centered Admin console, and provide explicit access-only CLI recovery.

### Patch Changes

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Replace ambiguous flattened actor identifiers with a discriminated `ActorRef` model for authenticated users, opaque external identities, agents, and services. Require `ActorRef` through tool execution, MCP routing, AI call options, create interceptors, tool events, and job provenance; remove flattened `userId` and `canonicalId` tool-context fields rather than deprecating them. Jobs retain every requester as `requestedByActor` and project `requestedByUserId` only through the centralized authenticated-user policy. New messages and durable memory use the new model, while legacy persisted actor metadata is normalized at read boundaries.

- Updated dependencies [[`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29)]:
  - @brains/utils@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies [[`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61)]:
  - @brains/utils@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- [#70](https://github.com/rizom-ai/brains/pull/70) [`4943d79`](https://github.com/rizom-ai/brains/commit/4943d79ecf4abefd4cf79a38a526e203ea32064a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Refresh known ATProto agent cards from a daily recurring check, preserving local relationship metadata while updating remote-owned snapshots and centralizing domain message-channel constants.

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.143

## 0.2.0-alpha.142

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.142

## 0.2.0-alpha.141

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.141

## 0.2.0-alpha.140

### Patch Changes

- Updated dependencies [[`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6), [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37)]:
  - @brains/utils@0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.128

## 0.2.0-alpha.127

## 0.2.0-alpha.126

## 0.2.0-alpha.125

## 0.2.0-alpha.124

## 0.2.0-alpha.123

## 0.2.0-alpha.122

## 0.2.0-alpha.121

## 0.2.0-alpha.120

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

## 0.2.0-alpha.109

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

## 0.2.0-alpha.77

## 0.2.0-alpha.76

## 0.2.0-alpha.75

## 0.2.0-alpha.74

## 0.2.0-alpha.73

## 0.2.0-alpha.72

## 0.2.0-alpha.71

## 0.2.0-alpha.70

## 0.2.0-alpha.69

## 0.2.0-alpha.68

## 0.2.0-alpha.67

## 0.2.0-alpha.66
