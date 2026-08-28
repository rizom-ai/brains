# @brains/console-theme

## 0.2.0-alpha.332

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.332

## 0.2.0-alpha.331

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.331

## 0.2.0-alpha.330

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.330

## 0.2.0-alpha.329

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.329

## 0.2.0-alpha.328

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.328

## 0.2.0-alpha.327

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.327

## 0.2.0-alpha.326

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.326

## 0.2.0-alpha.325

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.325

## 0.2.0-alpha.324

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.324

## 0.2.0-alpha.323

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.323

## 0.2.0-alpha.322

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.322

## 0.2.0-alpha.321

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.321

## 0.2.0-alpha.320

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.320

## 0.2.0-alpha.319

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.319

## 0.2.0-alpha.318

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.318

## 0.2.0-alpha.317

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.317

## 0.2.0-alpha.316

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.316

## 0.2.0-alpha.315

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.315

## 0.2.0-alpha.314

### Patch Changes

- [`f37d7ed`](https://github.com/rizom-ai/brains/commit/f37d7ed2f39245b2263967fcb03f1885cefcad40) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Render the console strip from one implementation.

  The strip existed twice — an HTML string in `@brains/console-theme` for the
  server-rendered shells and a parallel Preact component in the dashboard — with
  a comment asking to "keep the two in step". They had already drifted: the
  string version hardcoded an "Authenticated / AU" session chip while the
  dashboard showed the principal's name, role, and initials, and a visitor state.

  `renderConsoleStripHtml` now owns the full behavior (principal chip, visitor
  chip, HTML-escaped interpolation) and the dashboard injects the shared inner
  markup instead of restating it. The Studio editor and the admin and account
  consoles pass the principal they already hold, so their chips now show the
  signed-in user instead of the generic copy; web-chat keeps the role-neutral
  chip until its interface threads the principal through.

- [`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the console-surface topology out of the theme package.

  `@brains/console-theme` — described as a token sheet — hardcoded the console
  plugin ids, their permission tiers, and a structural copy of
  `RegisteredWebRoute`, so adding a console surface meant editing a CSS package.
  `deriveConsoleSurfaces` and its table now live in `@brains/plugins`, next to
  the web-route registry the doors derive from and typed against the real
  `RegisteredWebRoute`; the presentational `ConsoleSurface` shape moves to
  `@brains/contracts`, shared by the derivation and the strip renderer.
  console-theme keeps exactly what its description claims: CSS, fonts, boot
  scripts, and strip rendering. Per-plugin surface declaration at route
  registration remains the end state, governed by the HTTP route registry plan.

- Updated dependencies [[`9bd1925`](https://github.com/rizom-ai/brains/commit/9bd192562923351e62909c7a0662eeeb46453303), [`d339319`](https://github.com/rizom-ai/brains/commit/d339319dabea7f856b69c829e46d3937254880d3), [`ae06107`](https://github.com/rizom-ai/brains/commit/ae06107694a825378e23183c26261c91166edfdf), [`17507e8`](https://github.com/rizom-ai/brains/commit/17507e806efc5fde1c30496700de74b53575d350), [`497fbc0`](https://github.com/rizom-ai/brains/commit/497fbc0f6d672e23afd5263a519c4e73a740c2c5)]:
  - @brains/contracts@0.2.0-alpha.314

## 0.2.0-alpha.313

## 0.2.0-alpha.312

## 0.2.0-alpha.311

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

### Patch Changes

- [`2b6197f`](https://github.com/rizom-ai/brains/commit/2b6197f1f596b5ce0a41892fd4a4282648f73ddb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Fix the console paper climate against dark-default site themes by synchronizing climate changes with the matching semantic theme mode and applying the dashboard preference before styles load.

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

### Patch Changes

- [#72](https://github.com/rizom-ai/brains/pull/72) [`afa5cf4`](https://github.com/rizom-ai/brains/commit/afa5cf4cbdf75400b180d4bb89ed46dd4e6097cc) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Allow active Trusted principals to use the first-party Studio with principal-scoped reads, server-derived capabilities, policy-enforced writes, uploads, assists, and workspaces, authenticated actor attribution, and visibility-safe publication views while preserving Admin-only operational boundaries.

## 0.2.0-alpha.233

## 0.2.0-alpha.232

## 0.2.0-alpha.231

## 0.2.0-alpha.230

## 0.2.0-alpha.229

## 0.2.0-alpha.228

## 0.2.0-alpha.227

### Patch Changes

- [`219e273`](https://github.com/rizom-ai/brains/commit/219e27392f7322ba3349c8d234e42f537d02aa6e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the authenticated `/account` UI out of auth-service into a dedicated account console plugin. Keep session-derived account APIs in auth-service while giving self-service the shared console shell, climate, route-derived navigation, responsive React UI, and bundled runtime asset.

- [`500a6dc`](https://github.com/rizom-ai/brains/commit/500a6dc284a590e1e9bb6af9fa0995332eeb8c58) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the Admin-only People section in the standalone Admin console and migrate browser authentication from legacy operator terminology to role-aware auth sessions. Existing session rows and legacy browser cookies remain compatible through an explicit, release-gated migration window. Legacy dashboard `needsOperator` registration inputs remain accepted and normalize to `needsAttention`.

- [`d48cf69`](https://github.com/rizom-ai/brains/commit/d48cf69098a6ef7715e79784775b16e33d8f89bb) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Filter the console surface strip by the caller's permission level so a Trusted user no longer sees an Admin-only door. `deriveConsoleSurfaces` now takes the caller's level and omits surfaces above it (failing closed to public-only when unavailable), and every console surface (Dashboard, Chat, Studio, Admin) passes its resolved level. Authenticated non-Admins who reach `/admin` directly are redirected to their own `/account` surface instead of a bare, unstyled denial.

- [`5c1bed1`](https://github.com/rizom-ai/brains/commit/5c1bed1134f92701f4ead9b25a6f432cd208ac29) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Introduce stable person subjects for auth users and normalized canonical identity claims with independent assertion and verification evidence. Align auth persistence with generated Drizzle Kit migrations and a release-gated, row-preserving bridge for pre-Drizzle databases. Add access-neutral links between local people and independent external peer brains, including atomic peer-first invitations and existing-account linking, without inherited roles, identity claims, or attribution. Because the former representation model never shipped outside the feature branch, replace it through a clean generated schema correction rather than a historical data-copy transform or permanent dual-read path.

  Replace the unreleased My agents and representation-consent flow with the permanent Overview, Members/People, Invitations, and Audit Admin sections. Show passkeys under Sign-in, verified human-facing email and Discord under Connected channels, and optional external peers as a separate account facet. Keep hosted members without peers profileless, retain Studio ownership of the Anchor profile, omit internal IDs and generic Advanced identity tooling, expose actor-attributed audit events through an Admin-only endpoint and plain-language viewer, and bridge approved directory peers into the Admin invitation flow. Keep the monitoring dashboard free of management UI and expose Admin through route-derived console navigation and the Admin-gated command palette.

  Harden the internet-facing OAuth flow by rejecting suspended-user sessions at both authorization endpoints, returning MCP bearer claims plus the active principal from one JWT verification, requiring client-bound revocation, applying per-caller and runtime-wide bounds to open dynamic registration, and pruning stale unconsented clients at startup and on supervised maintenance. Deprecate ambiguous identity-resolution projection in favor of explicit resolved, denied, or unbound access results; bulk-load the Admin roster without per-user query fan-out; avoid duplicate browser-session resolution in web chat; preserve hash-only setup-delivery dedupe per recipient; centralize legacy imports, private mutation guards, safe error projection, mutation feedback, and persisted SHA-256 encodings; and retain exact private identity reconciliation without exposing canonical provider subjects.

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

### Patch Changes

- [`21b70b7`](https://github.com/rizom-ai/brains/commit/21b70b7962af2c815b51259e3a5d3afb7e900ba6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Improve paper-climate warning contrast so dashboard review states remain legible in light mode.

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

### Patch Changes

- [`f6dc969`](https://github.com/rizom-ai/brains/commit/f6dc96973a64c3f40694ae80fe4529a20d423e5d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bring Chat and Studio into the approved console visual language. Chat gains a compact conversation index and responsive composer while removing its parallel surface-token palette; Studio now applies the detailed editorial palette, IBM Plex Mono source treatment, grouped library metadata, manuscript typography, responsive Details/Write/Preview styling, authored image/date/toggle/tag widgets, conflict feedback, and a recoverable delete dialog. The shared font payload includes the Studio editorial mono face.

- [`b13774a`](https://github.com/rizom-ai/brains/commit/b13774afda0ba85356ab07ee29cdd09b19071054) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Operator-review fixes across the console: the climate toggle moves into the shared strip on all three surfaces (replacing the dashboard masthead button and chat's local toggle), the session chip gains a neutral visitor variant and quiet phone treatment, sign-in controls adopt the console button language, and the Studio library groups brain machinery under a System rail section, hides publication chips for types without a publication lifecycle, and repairs the phone type pills and row meta alignment.

## 0.2.0-alpha.156

## 0.2.0-alpha.155

## 0.2.0-alpha.154

## 0.2.0-alpha.153

## 0.2.0-alpha.152

## 0.2.0-alpha.151

## 0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- [`70ff530`](https://github.com/rizom-ai/brains/commit/70ff53084c5bb8d021e2a4f898e108b2de220d2a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align the operator console with the canonical navy instrument and warm paper mockups, and add deliberate tablet and phone compositions across the shared strip, command palette, dashboard, chat shell, and Studio editor. Refactor responsive styles into surface-local modules, make Studio controls climate-safe, and preserve the historical and responsive console mockups as implementation references.

## 0.2.0-alpha.148

### Patch Changes

- [`f7054af`](https://github.com/rizom-ai/brains/commit/f7054af14705adb7690def03c70009bf95b91b8b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Studio editor joins the console: its shell serves the shared
  @brains/console-theme sheet (paper climate default, console-wide
  console.climate preference wins) and the console strip with route-derived
  surface links; the appbar slims to a surface-local crumb bar; the local
  paper palette and IBM Plex Mono are replaced by console tokens and
  JetBrains Mono. The strip's HTML renderer and the console fonts URL move
  into @brains/console-theme, shared by web-chat and the Studio shell.

- [`d4e0245`](https://github.com/rizom-ai/brains/commit/d4e0245a37741bed6cfd7d588b77f951e36e38f2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Cross-surface ⌘K jump: an operator-gated /api/console/jump endpoint on
  the dashboard returns grouped doors (entity search hits open in the Studio
  editor via hash deep-links, widget groups open dashboard tabs), and a
  shared vanilla palette in @brains/console-theme — wired to the strip's
  ⌘K on all three surfaces — renders them. The Studio editor honors
  #/{type}/{id} deep-links, and chat appends its local conversations to
  the palette and resumes sessions from #s/{id} doors.

- [`d82b56c`](https://github.com/rizom-ai/brains/commit/d82b56cd9729a7a1d06a1232fea0674d9853da87) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Extract the operator-console token sheet into @brains/console-theme: one
  --console-\* vocabulary with two climates (instrument/paper) plus the shared
  console-strip chrome, replacing the dashboard's --dashboard-\* tokens. The
  strip's surface links now derive from registered web routes (service plugin
  contexts gain read access to the web-route registry), and the light/dark
  toggle becomes the console-wide climate preference persisted as
  console.climate.

- [`acc1f5a`](https://github.com/rizom-ai/brains/commit/acc1f5a3c0216dc4f33990e775334a4d5e8837a0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Web-chat joins the console: the chat page serves the shared
  @brains/console-theme sheet and the console strip (route-derived surface
  links, operator session chip), its --chat-\* palette copies are replaced by
  console tokens plus a thin chat-only block, and the in-app theme toggle
  becomes the console-wide climate toggle (console.climate,
  instrument/paper). Surface derivation and the climate script move into
  @brains/console-theme; the dashboard imports them from there.
