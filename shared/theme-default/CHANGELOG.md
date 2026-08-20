# @brains/theme-default

## 0.2.0-alpha.235

### Patch Changes

- [`51a88ae`](https://github.com/rizom-ai/brains/commit/51a88ae3bd81a31c2cd8519f8f38781966af5b44) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Declare the shared Rizom button defaults once, in `@rizom/theme-default`.

  Both brand themes restated the full `--rizom-btn-*` vocabulary; 23 of the
  declarations were character-identical. Those now live in the base theme both
  brands compose (same `@layer theme` / `:root` scope), with each brand keeping
  only its genuine deltas. Composed token values are verified unchanged for both
  themes, and sites running the plain default theme now get real button defaults
  instead of relying on per-component fallbacks.

## 0.2.0-alpha.234

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. The SDK and theme packages — `@rizom/site`, `@rizom/site-sections`, `@rizom/theme-default`, `@rizom/theme-signal`, `@rizom/theme-rizom-ai` — remain **Apache-2.0**; the Rizom-owned site packages (`@rizom/site-docs`, `@rizom/site-rizom`, `@rizom/site-rizom-ai`, `@rizom/site-rizom-foundation`, `@rizom/site-rizom-work`) are now **AGPL-3.0-only**. Site packages built against the Apache-licensed interfaces are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

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

## 0.2.0-alpha.229

## 0.2.0-alpha.228

## 0.2.0-alpha.227

## 0.2.0-alpha.226

## 0.2.0-alpha.225

## 0.2.0-alpha.224

## 0.2.0-alpha.223

## 0.2.0-alpha.222

## 0.2.0-alpha.221

## 0.2.0-alpha.220

## 0.2.0-alpha.219

## 0.2.0-alpha.218

## 0.2.0-alpha.217

## 0.2.0-alpha.216

## 0.2.0-alpha.215

## 0.2.0-alpha.214

## 0.2.0-alpha.213

## 0.2.0-alpha.212

## 0.2.0-alpha.211

## 0.2.0-alpha.210

## 0.2.0-alpha.209

## 0.2.0-alpha.208

## 0.2.0-alpha.207

## 0.2.0-alpha.206

## 0.2.0-alpha.205

## 0.2.0-alpha.204

## 0.2.0-alpha.203

## 0.2.0-alpha.202

## 0.2.0-alpha.201

## 0.2.0-alpha.200

## 0.2.0-alpha.199

## 0.2.0-alpha.198

## 0.2.0-alpha.197

## 0.2.0-alpha.196

## 0.2.0-alpha.195

## 0.2.0-alpha.194

## 0.2.0-alpha.193

## 0.2.0-alpha.192

## 0.2.0-alpha.191

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

## 0.2.0-alpha.179

## 0.2.0-alpha.178

## 0.2.0-alpha.177

## 0.2.0-alpha.176

## 0.2.0-alpha.175

## 0.2.0-alpha.174

## 0.2.0-alpha.173

## 0.2.0-alpha.172

## 0.2.0-alpha.171

## 0.2.0-alpha.170

## 0.2.0-alpha.169

## 0.2.0-alpha.168

## 0.2.0-alpha.167

## 0.2.0-alpha.166

## 0.2.0-alpha.165

## 0.2.0-alpha.164

## 0.2.0-alpha.163

## 0.2.0-alpha.162

### Patch Changes

- [`457e95f`](https://github.com/rizom-ai/brains/commit/457e95f38476ef5fdc2b676ae83153de6be66599) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Themes become independently published npm packages, completing the
  published-package model for brain.yaml: `@rizom/theme-default` (the editorial
  base) and `@rizom/theme-rizom-ai` (the consolidated rizom.ai theme, depending
  on the base so fixes flow via npm resolution) publish dist-only artifacts with
  their CSS inlined. The brain entrypoint registers `@rizom/theme-default` and
  keeps a `@brains/theme-default` alias for pre-rename brain.yaml files; hosted
  deployments install `@rizom/*` theme refs next to the brain instead of
  requiring themes to be bundled into a brain release.

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

## 0.2.0-alpha.144

## 0.2.0-alpha.143

## 0.2.0-alpha.142

## 0.2.0-alpha.141

## 0.2.0-alpha.140

## 0.2.0-alpha.139

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.139

## 0.2.0-alpha.138

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.138

## 0.2.0-alpha.137

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.137

## 0.2.0-alpha.136

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.136

## 0.2.0-alpha.135

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.135

## 0.2.0-alpha.134

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.134

## 0.2.0-alpha.133

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.133

## 0.2.0-alpha.132

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.132

## 0.2.0-alpha.131

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.131

## 0.2.0-alpha.130

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.130

## 0.2.0-alpha.129

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.129

## 0.2.0-alpha.128

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.128

## 0.2.0-alpha.127

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.127

## 0.2.0-alpha.126

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.126

## 0.2.0-alpha.125

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.125

## 0.2.0-alpha.124

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.124

## 0.2.0-alpha.123

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.123

## 0.2.0-alpha.122

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.122

## 0.2.0-alpha.121

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.121

## 0.2.0-alpha.120

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.120

## 0.2.0-alpha.119

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.119

## 0.2.0-alpha.118

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.118

## 0.2.0-alpha.117

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.117

## 0.2.0-alpha.116

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.116

## 0.2.0-alpha.115

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.115

## 0.2.0-alpha.114

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.114

## 0.2.0-alpha.113

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.113

## 0.2.0-alpha.112

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.112

## 0.2.0-alpha.111

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.111

## 0.2.0-alpha.110

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.110

## 0.2.0-alpha.109

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.109

## 0.2.0-alpha.108

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.108

## 0.2.0-alpha.107

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.107

## 0.2.0-alpha.106

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.106

## 0.2.0-alpha.105

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.105

## 0.2.0-alpha.104

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.104

## 0.2.0-alpha.103

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.103

## 0.2.0-alpha.102

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.102

## 0.2.0-alpha.101

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.101

## 0.2.0-alpha.100

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.100

## 0.2.0-alpha.99

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.99

## 0.2.0-alpha.98

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.98

## 0.2.0-alpha.97

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.97

## 0.2.0-alpha.96

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.96

## 0.2.0-alpha.95

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.95

## 0.2.0-alpha.94

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.94

## 0.2.0-alpha.93

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.93

## 0.2.0-alpha.92

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.92

## 0.2.0-alpha.91

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.91

## 0.2.0-alpha.90

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.90

## 0.2.0-alpha.89

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.89

## 0.2.0-alpha.88

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.88

## 0.2.0-alpha.87

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.87

## 0.2.0-alpha.86

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.86

## 0.2.0-alpha.85

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.85

## 0.2.0-alpha.84

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.84

## 0.2.0-alpha.83

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.83

## 0.2.0-alpha.82

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.82

## 0.2.0-alpha.81

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.81

## 0.2.0-alpha.80

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.80

## 0.2.0-alpha.79

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.79

## 0.2.0-alpha.78

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.78

## 0.2.0-alpha.77

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.77

## 0.2.0-alpha.76

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.76

## 0.2.0-alpha.75

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.75

## 0.2.0-alpha.74

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.74

## 0.2.0-alpha.73

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.73

## 0.2.0-alpha.72

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.72

## 0.2.0-alpha.71

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.71

## 0.2.0-alpha.70

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.70

## 0.2.0-alpha.69

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.69

## 0.2.0-alpha.68

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.68

## 0.2.0-alpha.67

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.67

## 0.2.0-alpha.66

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.66

## 0.2.0-alpha.65

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.65

## 0.2.0-alpha.64

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.64

## 0.2.0-alpha.63

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.63

## 0.2.0-alpha.62

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.62

## 0.2.0-alpha.61

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.61

## 0.2.0-alpha.60

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.60

## 0.2.0-alpha.59

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.59

## 0.2.0-alpha.58

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.58

## 0.2.0-alpha.57

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.57

## 0.2.0-alpha.56

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.56

## 0.2.0-alpha.55

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.55

## 0.2.0-alpha.54

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.54

## 0.2.0-alpha.53

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.53

## 0.2.0-alpha.52

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.52

## 0.2.0-alpha.51

### Patch Changes

- [`2988101`](https://github.com/rizom-ai/brains/commit/29881019994e060d8ae18d73586d98014bba1d66) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Tighten typography and editorial layout on the professional site to match the rizom-aligned mock. Load Fraunces with the SOFT axis range (was inert), introduce `--color-rule` / `--color-rule-strong` / `--color-accent-soft` / `--color-bg-deep` tokens and matching utilities, refine the light palette toward the mock's warmer cream, and wire `.hero-bg-pattern` / `.cta-bg-pattern` / `.section-divider` / `.section-rule` to actual CSS rules. UI library updates: 3-column header (wordmark | nav | toggle), `.nav-link` utility, single-moon ThemeToggle, editorial entry styling with hover→accent + 1px rule separators, mono pill CTA button, and a footer wordmark size override. Drop the unused `--font-serif` token + `.font-serif` utility.

- Updated dependencies [[`2988101`](https://github.com/rizom-ai/brains/commit/29881019994e060d8ae18d73586d98014bba1d66)]:
  - @brains/theme-base@0.2.0-alpha.51

## 0.2.0-alpha.50

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.50

## 0.2.0-alpha.49

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.49

## 0.2.0-alpha.48

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.48

## 0.2.0-alpha.47

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.47

## 0.2.0-alpha.46

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.46

## 0.2.0-alpha.45

### Patch Changes

- [`823e2cb`](https://github.com/rizom-ai/brains/commit/823e2cba7631f4e10dfb00d9e6cd5d351f146907) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Redesign the personal site template with an editorial homepage/about layout, semantic theme colors, preserved post cover cards, sticky-footer CTA sections, and markdown italic tagline accents. Update the rover default test app to use the personal site template.

  Rework the default theme into a simplified Rizom-inspired editorial base and layer the full Rizom brand theme on top of it. Add shared theme-base support for font utilities, dark-surface text, sticky-footer body hygiene, and reusable hero/CTA decoration hooks.

- Updated dependencies [[`823e2cb`](https://github.com/rizom-ai/brains/commit/823e2cba7631f4e10dfb00d9e6cd5d351f146907)]:
  - @brains/theme-base@0.2.0-alpha.45

## 0.2.0-alpha.44

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.44

## 0.2.0-alpha.43

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.43

## 0.2.0-alpha.42

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.42

## 0.2.0-alpha.41

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.41

## 0.2.0-alpha.40

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.40

## 0.2.0-alpha.39

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.39

## 0.2.0-alpha.38

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.38

## 0.2.0-alpha.37

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.37

## 0.2.0-alpha.36

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.36

## 0.2.0-alpha.35

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.35

## 0.2.0-alpha.34

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.34

## 0.2.0-alpha.33

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.33

## 0.2.0-alpha.32

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.32

## 0.2.0-alpha.31

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.31

## 0.2.0-alpha.30

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.30

## 0.2.0-alpha.29

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.29

## 0.2.0-alpha.28

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.28

## 0.2.0-alpha.27

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.27

## 0.2.0-alpha.26

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.26

## 0.2.0-alpha.25

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.25

## 0.2.0-alpha.24

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.24

## 0.2.0-alpha.23

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.23

## 0.2.0-alpha.22

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.22

## 0.2.0-alpha.21

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.21

## 0.2.0-alpha.20

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.20

## 0.2.0-alpha.19

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.19

## 0.2.0-alpha.18

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.18

## 0.2.0-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.17

## 0.2.0-alpha.16

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.16

## 0.2.0-alpha.15

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.15

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.14

## 0.2.0-alpha.13

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.13

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.12

## 0.2.0-alpha.11

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.11

## 0.2.0-alpha.10

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.10

## 0.2.0-alpha.9

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.9

## 0.2.0-alpha.8

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.8

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.7

## 0.2.0-alpha.6

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.6

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.5

## 0.2.0-alpha.4

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.4

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.3

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.2

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@0.2.0-alpha.1

## 1.0.1-alpha.17

### Patch Changes

- Updated dependencies []:
  - @brains/theme-base@1.0.1-alpha.17
