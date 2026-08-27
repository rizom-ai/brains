# @brains/utils

## 0.2.0-alpha.331

## 0.2.0-alpha.330

## 0.2.0-alpha.329

## 0.2.0-alpha.328

## 0.2.0-alpha.327

## 0.2.0-alpha.326

## 0.2.0-alpha.325

## 0.2.0-alpha.324

## 0.2.0-alpha.323

## 0.2.0-alpha.322

## 0.2.0-alpha.321

## 0.2.0-alpha.320

## 0.2.0-alpha.319

## 0.2.0-alpha.318

## 0.2.0-alpha.317

## 0.2.0-alpha.316

## 0.2.0-alpha.315

## 0.2.0-alpha.314

## 0.2.0-alpha.313

## 0.2.0-alpha.312

## 0.2.0-alpha.311

### Patch Changes

- [#151](https://github.com/rizom-ai/brains/pull/151) [`0b4d2bc`](https://github.com/rizom-ai/brains/commit/0b4d2bca39b83d60183c0040f63f4bb9c2f9d029) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Resolve directory-sync environment references inside the dedicated Git broker process before broker host startup.

  Packaged deployments can continue to keep the remote credential in `GIT_SYNC_TOKEN`: the broker resolves the configured reference from its inherited environment, retains the credential only in broker memory, and injects it into each Git network child without persisting it or sending it over the broker protocol.

## 0.2.0-alpha.310

## 0.2.0-alpha.309

## 0.2.0-alpha.308

## 0.2.0-alpha.307

## 0.2.0-alpha.306

## 0.2.0-alpha.305

## 0.2.0-alpha.304

## 0.2.0-alpha.303

## 0.2.0-alpha.302

## 0.2.0-alpha.301

## 0.2.0-alpha.300

## 0.2.0-alpha.299

## 0.2.0-alpha.298

## 0.2.0-alpha.297

## 0.2.0-alpha.296

## 0.2.0-alpha.295

## 0.2.0-alpha.294

## 0.2.0-alpha.293

## 0.2.0-alpha.292

## 0.2.0-alpha.291

## 0.2.0-alpha.290

## 0.2.0-alpha.289

## 0.2.0-alpha.288

## 0.2.0-alpha.287

## 0.2.0-alpha.286

## 0.2.0-alpha.285

## 0.2.0-alpha.284

## 0.2.0-alpha.283

## 0.2.0-alpha.282

## 0.2.0-alpha.281

## 0.2.0-alpha.280

## 0.2.0-alpha.279

## 0.2.0-alpha.278

## 0.2.0-alpha.277

## 0.2.0-alpha.276

## 0.2.0-alpha.275

## 0.2.0-alpha.274

## 0.2.0-alpha.273

## 0.2.0-alpha.272

## 0.2.0-alpha.271

## 0.2.0-alpha.270

## 0.2.0-alpha.269

## 0.2.0-alpha.268

## 0.2.0-alpha.267

## 0.2.0-alpha.266

### Patch Changes

- [`e70ab12`](https://github.com/rizom-ai/brains/commit/e70ab12745c6cf757f685389f4cd6de8991de95f) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Behavior-preserving quality refactors: shared SerialQueue/KeyedSerialQueue primitive in @brains/utils replacing five hand-rolled promise-tail mutexes; directory-sync stress system split into command runner, git checkout, and health monitor modules; job-queue worker heartbeat/deadline/error-callback dedup and table-generic schema column helpers; consolidated pilot starter staleness detection; single-pass HTTP route registry views; projection wave planning simplification with indexed graph edges.

## 0.2.0-alpha.265

## 0.2.0-alpha.264

## 0.2.0-alpha.263

## 0.2.0-alpha.262

## 0.2.0-alpha.261

## 0.2.0-alpha.260

## 0.2.0-alpha.259

## 0.2.0-alpha.258

## 0.2.0-alpha.257

## 0.2.0-alpha.256

### Patch Changes

- [#84](https://github.com/rizom-ai/brains/pull/84) [`1e45eca`](https://github.com/rizom-ai/brains/commit/1e45ecaaed5351964cbf8a0754a301507b15c298) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bound background job execution with per-handler deadlines and required cancellation signals. Persist worker sessions and renewable attempt leases, fence completion, failure, progress, and heartbeat writes by unique attempt token, and immediately recover attempts when a stable worker slot starts a replacement session.

## 0.2.0-alpha.255

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

## 0.2.0-alpha.244

## 0.2.0-alpha.243

## 0.2.0-alpha.242

## 0.2.0-alpha.241

## 0.2.0-alpha.240

## 0.2.0-alpha.239

## 0.2.0-alpha.238

## 0.2.0-alpha.237

## 0.2.0-alpha.236

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

- [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add access-neutral links between local people and independent external peer brains, including atomic peer-first invitations and existing-account linking, without inherited roles, identity claims, or attribution. Because the former representation model never shipped outside the feature branch, replace it through a clean generated schema correction rather than a historical data-copy transform or permanent dual-read path.

  Replace the unreleased My agents and representation-consent flow with the permanent Overview, Members/People, Invitations, and Audit Admin sections. Show passkeys under Sign-in, verified human-facing email and Discord under Connected channels, and optional external peers as a separate account facet. Keep hosted members without peers profileless, retain CMS ownership of the Anchor profile, omit internal IDs and generic Advanced identity tooling, expose actor-attributed audit events through an Admin-only endpoint and plain-language viewer, and bridge approved directory peers into the Admin invitation flow. Keep the monitoring dashboard free of management UI and expose Admin through route-derived console navigation and the Admin-gated command palette.

  Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on supervised maintenance. Deprecate ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results; bulk-load the Admin roster without per-user query fan-out; avoid duplicate browser-session resolution in web chat; preserve hash-only setup-delivery dedupe per recipient; centralize legacy imports, private mutation guards, safe error projection, mutation feedback, and persisted SHA-256 encodings; and retain exact private identity reconciliation without exposing canonical provider subjects.

## 0.2.0-alpha.226

## 0.2.0-alpha.225

## 0.2.0-alpha.224

### Patch Changes

- [`b7c5df6`](https://github.com/rizom-ai/brains/commit/b7c5df61ebe0aa44f6b786695f16daa7ee151e61) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add bounded, authority-refetched ATProto Jetstream discovery with safe public egress, durable replay state, identity-collision protection, staleness handling, heartbeat publishing, review digests, and per-brain canary configuration.

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

### Patch Changes

- [`a30edc7`](https://github.com/rizom-ai/brains/commit/a30edc7ac66807c66cba2bc94e78206f133710d6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Extract shared site-datasource logic: fetchAnchorProfileData (fetch+parse profile) added to identity-service and re-exported via @brains/plugins; fetchRecentEntities and requireCta added to @brains/site-info. The personal/professional homepage and about datasources now compose these instead of repeating profile fetch/parse, entity list/sort/slice/map, and the CTA guard.

- [`cea906c`](https://github.com/rizom-ai/brains/commit/cea906c689d40dee5f06ab949d5289c2660bfd37) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Split the utils grab-bag into explicit subpath modules (@brains/utils/logger, /id, /markdown, /yaml, /progress, /string-utils, …) and delete the root barrel; the pinned zod re-export lives at @brains/utils/zod and the package root exports nothing. All consumers import the specific module they use.

## 0.2.0-alpha.139

## 0.2.0-alpha.138

## 0.2.0-alpha.137

## 0.2.0-alpha.136

## 0.2.0-alpha.135

## 0.2.0-alpha.134

## 0.2.0-alpha.133

## 0.2.0-alpha.132

## 0.2.0-alpha.131

## 0.2.0-alpha.130

## 0.2.0-alpha.129

## 0.2.0-alpha.128

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

## 0.2.0-alpha.65

## 0.2.0-alpha.64

## 0.2.0-alpha.63

## 0.2.0-alpha.62

## 0.2.0-alpha.61

## 0.2.0-alpha.60

## 0.2.0-alpha.59

## 0.2.0-alpha.58

## 0.2.0-alpha.57

## 0.2.0-alpha.56

## 0.2.0-alpha.55

## 0.2.0-alpha.54

## 0.2.0-alpha.53

## 0.2.0-alpha.52

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

## 0.2.0-alpha.36

## 0.2.0-alpha.35

## 0.2.0-alpha.34

## 0.2.0-alpha.33

## 0.2.0-alpha.32

## 0.2.0-alpha.31

## 0.2.0-alpha.30

## 0.2.0-alpha.29

## 0.2.0-alpha.28

## 0.2.0-alpha.27

## 0.2.0-alpha.26

## 0.2.0-alpha.25

## 0.2.0-alpha.24

## 0.2.0-alpha.23

## 0.2.0-alpha.22

## 0.2.0-alpha.21

## 0.2.0-alpha.20

## 0.2.0-alpha.19

## 0.2.0-alpha.18

## 0.2.0-alpha.17

## 0.2.0-alpha.16

## 0.2.0-alpha.15

## 0.2.0-alpha.14

## 0.2.0-alpha.13

## 0.2.0-alpha.12

## 0.2.0-alpha.11

## 0.2.0-alpha.10

## 0.2.0-alpha.9

## 0.2.0-alpha.8

## 0.2.0-alpha.7

## 0.2.0-alpha.6

## 0.2.0-alpha.5

## 0.2.0-alpha.4

## 0.2.0-alpha.3

## 0.2.0-alpha.2

## 0.2.0-alpha.1

## 1.0.1-alpha.17
