# @rizom/site-docs

## 0.2.0-alpha.236

### Patch Changes

- Updated dependencies [[`e4bd645`](https://github.com/rizom-ai/brains/commit/e4bd6451d4d83efb43b6847c5729b1ad9ef041ae)]:
  - @rizom/site@0.2.0-alpha.232

## 0.2.0-alpha.235

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. The SDK and theme packages — `@rizom/site`, `@rizom/site-sections`, `@rizom/theme-default`, `@rizom/theme-signal`, `@rizom/theme-rizom-ai` — remain **Apache-2.0**; the Rizom-owned site packages (`@rizom/site-docs`, `@rizom/site-rizom`, `@rizom/site-rizom-ai`, `@rizom/site-rizom-foundation`, `@rizom/site-rizom-work`) are now **AGPL-3.0-only**. Site packages built against the Apache-licensed interfaces are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

- Updated dependencies [[`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5)]:
  - @rizom/site@0.2.0-alpha.231

## 0.2.0-alpha.234

### Patch Changes

- [`d897f41`](https://github.com/rizom-ai/brains/commit/d897f41e93640c1e30c0637fcca3736a10d8c3ec) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare preact as a peer dependency instead of a hard dependency. The external
  site authoring contract has the host runtime provide preact; shipping it in
  `dependencies` installed a second preact instance next to the host's. This
  aligns the first-party site packages with the standalone reference canary.

## 0.2.0-alpha.233

### Patch Changes

- [`76a29f9`](https://github.com/rizom-ai/brains/commit/76a29f93e5b53044d0b59fecf36831fda8aa6a24) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Publish correct registry metadata for site and theme packages. `postpack: publish-manifest restore` put the authoring manifest back mid-publish, and npm derives the registry packument from the on-disk manifest _after_ postpack — so every release shipped a correct tarball alongside a packument that retained `publishPeerDependencies` and dropped the real `@rizom/brain` peer range (0.2.0-alpha.231 and .232 are affected; the same mechanism caused the earlier `workspace:*` packuments). Restoring is now done once by the release wrapper after the whole publish completes, and a drift-guard test fails if any publishable package reintroduces a mid-publish restore.

## 0.2.0-alpha.232

### Patch Changes

- [`8ec2bd7`](https://github.com/rizom-ai/brains/commit/8ec2bd745e2aa25c61f48216e7552c48e6466361) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Reject published site/theme manifests that ship unresolved `workspace:` specifiers in any dependency field. The release-time peer-metadata check now guards against the alpha.144/145 packument failure mode (a `workspace:*` range surviving into the registry manifest) in addition to the `@rizom/brain` peer range and authoring-only field checks.

## 0.2.0-alpha.231

### Patch Changes

- [#71](https://github.com/rizom-ai/brains/pull/71) [`c7547f5`](https://github.com/rizom-ai/brains/commit/c7547f5dfa2756cfded40800b7fdb76a8375ef4f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Release site and theme packages independently and publish standard `@rizom/brain` peer compatibility metadata in both npm packuments and tarballs.

## 0.2.0-alpha.230

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.230

## 0.2.0-alpha.229

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.229

## 0.2.0-alpha.228

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.227

## 0.2.0-alpha.226

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.226

## 0.2.0-alpha.225

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.224

## 0.2.0-alpha.223

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.223

## 0.2.0-alpha.222

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.222

## 0.2.0-alpha.221

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.221

## 0.2.0-alpha.220

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.220

## 0.2.0-alpha.219

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.219

## 0.2.0-alpha.218

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.218

## 0.2.0-alpha.217

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.217

## 0.2.0-alpha.216

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.216

## 0.2.0-alpha.215

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.215

## 0.2.0-alpha.214

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.214

## 0.2.0-alpha.213

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.213

## 0.2.0-alpha.212

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.212

## 0.2.0-alpha.211

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.211

## 0.2.0-alpha.210

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.210

## 0.2.0-alpha.209

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.209

## 0.2.0-alpha.208

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.208

## 0.2.0-alpha.207

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.207

## 0.2.0-alpha.206

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.206

## 0.2.0-alpha.205

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.205

## 0.2.0-alpha.204

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.204

## 0.2.0-alpha.203

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.203

## 0.2.0-alpha.202

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.202

## 0.2.0-alpha.201

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.201

## 0.2.0-alpha.200

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.200

## 0.2.0-alpha.199

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.199

## 0.2.0-alpha.198

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.198

## 0.2.0-alpha.197

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.197

## 0.2.0-alpha.196

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.196

## 0.2.0-alpha.195

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.195

## 0.2.0-alpha.194

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.194

## 0.2.0-alpha.193

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.193

## 0.2.0-alpha.192

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.192

## 0.2.0-alpha.191

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.191

## 0.2.0-alpha.190

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.190

## 0.2.0-alpha.189

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.189

## 0.2.0-alpha.188

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.188

## 0.2.0-alpha.187

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.187

## 0.2.0-alpha.186

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.186

## 0.2.0-alpha.185

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.185

## 0.2.0-alpha.184

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.184

## 0.2.0-alpha.183

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.183

## 0.2.0-alpha.182

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.182

## 0.2.0-alpha.181

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.181

## 0.2.0-alpha.180

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.180

## 0.2.0-alpha.179

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.179

## 0.2.0-alpha.178

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.178

## 0.2.0-alpha.177

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.177

## 0.2.0-alpha.176

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.176

## 0.2.0-alpha.175

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.175

## 0.2.0-alpha.174

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.174

## 0.2.0-alpha.173

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.173

## 0.2.0-alpha.172

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.172

## 0.2.0-alpha.171

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.171

## 0.2.0-alpha.170

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.170

## 0.2.0-alpha.169

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.169

## 0.2.0-alpha.168

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.168

## 0.2.0-alpha.167

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.167

## 0.2.0-alpha.166

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.166

## 0.2.0-alpha.165

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.165

## 0.2.0-alpha.164

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.164

## 0.2.0-alpha.163

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.162

## 0.2.0-alpha.161

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- Updated dependencies [[`7a1d3a0`](https://github.com/rizom-ai/brains/commit/7a1d3a0417afba050565948dc3f1e7aadc4eff89)]:
  - @rizom/site@0.2.0-alpha.160

## 0.2.0-alpha.159

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.159

## 0.2.0-alpha.158

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.158

## 0.2.0-alpha.157

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.157

## 0.2.0-alpha.156

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.156

## 0.2.0-alpha.155

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.155

## 0.2.0-alpha.154

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.154

## 0.2.0-alpha.153

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.153

## 0.2.0-alpha.152

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.152

## 0.2.0-alpha.151

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.151

## 0.2.0-alpha.150

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.149

## 0.2.0-alpha.148

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.148

## 0.2.0-alpha.147

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.147

## 0.2.0-alpha.146

### Patch Changes

- [`04b5b53`](https://github.com/rizom-ai/brains/commit/04b5b53f68b983ef10545b793521ca279aac67b9) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Republish the public site packages with concrete pinned dependencies. npm builds the registry dependency metadata from the on-disk manifest before prepack rewrites it, so the `workspace:*` ranges in 0.2.0-alpha.144/145 shipped uninstallable packuments even though the tarball manifests were clean.

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.146

## 0.2.0-alpha.145

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.145

## 0.2.0-alpha.144

### Patch Changes

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.144

## 0.2.0-alpha.143

### Patch Changes

- [`4a2f297`](https://github.com/rizom-ai/brains/commit/4a2f2977d4792403cf48570d2ca36d92ccb57838) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Use published @rizom site package ranges instead of workspace-only dependency specifiers.

- Updated dependencies []:
  - @rizom/site@0.2.0-alpha.143

## 0.2.0-alpha.142

### Minor Changes

- [`442a843`](https://github.com/rizom-ai/brains/commit/442a843b07b0ee90a7332df86fc56bc8fb15db37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the `@rizom/site-docs` package for the docs.rizom.ai site on the public `@rizom/site` authoring SDK boundary.

### Patch Changes

- Updated dependencies [[`e789ec6`](https://github.com/rizom-ai/brains/commit/e789ec67cd3edc20ff1cf4ac9a7de08de0f415a5)]:
  - @rizom/site@0.2.0-alpha.142
