# @rizom/site

## 0.2.0-alpha.244

### Patch Changes

- [#851](https://github.com/rizom-ai/brains/pull/851) [`60bd903`](https://github.com/rizom-ai/brains/commit/60bd90309108aaa24bf8597d8245260dbc479e39) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The entity display description sits on `EntityDisplayEntry`, where editors show it, and `SectionDefinitionInput` says what it is: one section placed on a route, by its id, its `namespace:name` template and its content or data query. It had carried the entity display description.

## 0.2.0-alpha.243

### Patch Changes

- [#835](https://github.com/rizom-ai/brains/pull/835) [`804a82c`](https://github.com/rizom-ai/brains/commit/804a82c4759f9301bf3fc38948d4529b7c877251) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `SiteLayoutInfo` carries the anchor's `photo`. The Fourth's footer follows Sam's mockup: the wordmark beside the profiles, stacked, and the email; then the anchor's photo, the places of the privacy, terms and cookie pages, and the language switch as a pill over the copyright and the credit to Rizom.

## 0.2.0-alpha.242

### Patch Changes

- [#832](https://github.com/rizom-ai/brains/pull/832) [`e760242`](https://github.com/rizom-ai/brains/commit/e76024214dbe73dda4eb588cfb487fee6ab190c4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `@rizom/site` exports `SocialLinkPlatform` and `SOCIAL_LINK_PLATFORM_LABELS`, and a layout's social links can name a podcast. The docs and Rizom sites name their links from that one list.

  The Fourth's homepage follows Sam's one-page design. Act I has one way on, "How it works", and no thread on the key's tag. Act III names each program in bold. Act IV pins the clients' words on paper beside the stories, Rizom's on the right and TWTN's on the left, with no links on the cards. The epilogue introduces the team: each guide's portrait, name, bio and areas of expertise, stacked on a phone, with no button. The footer lists the brain's profiles (each in a new tab) and credits Rizom in place of the city line.

## 0.2.0-alpha.241

### Minor Changes

- [#802](https://github.com/rizom-ai/brains/pull/802) [`86b4c58`](https://github.com/rizom-ai/brains/commit/86b4c582c2cb4982aef3995f38f054e6cea34d70) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Breaking: a route places a schema-first section by its runtime name, `namespace:name` (`home:hero`), the same form every template has. The dotted `home.hero` was rewritten by `defineSite()` only, so a site exported without it rendered nothing for those sections; it is now rejected with the colon spelling to use. `defineSite()` still makes `content.home.hero` the fallback of the section placed as `home:hero`, and validation messages name sections the same way. The bundled sites use the colon form.

## 0.2.0-alpha.240

### Patch Changes

- [#778](https://github.com/rizom-ai/brains/pull/778) [`66de6ee`](https://github.com/rizom-ai/brains/commit/66de6ee6c8c1a29d5b4d9220dcc7375dd5e679b0) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A site can declare the languages it is built in: `defineSite({ languages: ["en", "zh-TW"] })`, the first the default. Language tags are validated, a language declared twice is refused, and so is a route under another language's path. `languagePath(language, defaultLanguage, path)` gives where a page lives in a language: the default keeps the route's own path, every other language puts its lowercased tag in front (`/zh-tw/about`). Layouts receive the page's `language` and its `alternates` (`SiteAlternate`: every language the page is built in, with its path there), for a language switch that offers only what exists. A route can carry its head and navigation label in the other languages (`translations: { "zh-TW": { title, description, navigationLabel } }`), and site metadata its title, description, copyright and call to action (`translations`, `SiteMetadataTranslation`). A section can be drawn another way in another language: `defineSection(schema, Component, { …meta, components: { "zh-TW": ComponentZh } })`; both drawings read the same copy fields.

## 0.2.0-alpha.239

### Patch Changes

- [#537](https://github.com/rizom-ai/brains/pull/537) [`ee47ed6`](https://github.com/rizom-ai/brains/commit/ee47ed60668af9f417e466a7820b350b5384ff1c) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A site can render an entity type's pages with a template of its choosing through `entityDisplay.<type>.detailTemplate`. The books site renders topics as theme pages: the theme's summary, a strand showing how many sections of each book stand close to it by year, and its closest passages, all found by stored embeddings without API calls. A section split across several entries counts once. Plugins share one related-entries lookup over stored embeddings, `findRelatedEntities`. Detail pages fall back to the title in an entry's frontmatter before naming it by type and slug. Book pages count one book or section in the singular.

## 0.2.0-alpha.238

### Patch Changes

- [#440](https://github.com/rizom-ai/brains/pull/440) [`170627a`](https://github.com/rizom-ai/brains/commit/170627a74751e592f1818776a8209aa2ef2b21f6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Exports `entityDisplaySchema`, the one definition of a site's entity display settings; `EntityDisplayEntry` is derived from it.

## 0.2.0-alpha.237

### Patch Changes

- [#439](https://github.com/rizom-ai/brains/pull/439) [`3d40351`](https://github.com/rizom-ai/brains/commit/3d40351fa5b05ab04d1e7a196a3287a4fda5bf57) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Clarify and test entityDisplay.citable semantics: false always excludes a type from answer citations; any true entries form an explicit selection, otherwise page-bearing entries remain candidates unless excluded. Citation selection does not remove routes or grant access permissions.

## 0.2.0-alpha.236

### Patch Changes

- [#438](https://github.com/rizom-ai/brains/pull/438) [`8df97bf`](https://github.com/rizom-ai/brains/commit/8df97bf413df6bc4d5d0d20e06366b2720a591c6) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Entity display entries accept `citable: true`, marking a type as a piece of work a visitor's answer may cite as a source.

## 0.2.0-alpha.235

### Patch Changes

- [#182](https://github.com/rizom-ai/brains/pull/182) [`8b10704`](https://github.com/rizom-ai/brains/commit/8b107040ea95cb3e87d8ae1bebd8dc3876f84c75) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Move the prerelease site-authoring contract from Preact to React 19 and React DOM before the stable 0.2.0 compatibility line is frozen.

## 0.2.0-alpha.234

### Patch Changes

- [`81e8f76`](https://github.com/rizom-ai/brains/commit/81e8f767a67e1efcdb585b3929635b35c6519214) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Raise the minimum Zod 4 range to 4.2 so workspace schemas use the Standard Schema JSON conversion required by the MCP v2 runtime.

## 0.2.0-alpha.233

### Patch Changes

- [#92](https://github.com/rizom-ai/brains/pull/92) [`964de88`](https://github.com/rizom-ai/brains/commit/964de8838ad9a2b686a0031d540e6d2756318d2b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Keep the stable `@rizom/site` authoring SDK brand-neutral by moving the Rizom-specific frame, navigation, ecosystem, and footer contracts to `@rizom/site-rizom`.

## 0.2.0-alpha.232

### Minor Changes

- [`e4bd645`](https://github.com/rizom-ai/brains/commit/e4bd6451d4d83efb43b6847c5729b1ad9ef041ae) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Require rendered section schemas to produce JSON-native object content. Optional section fields must normalize absence to `null`; schemas that emit `undefined`, primitives, functions, or other non-JSON values now fail typechecking.

  Export shared JSON document types from `@rizom/site` for site-authoring contracts.

## 0.2.0-alpha.231

### Patch Changes

- [`b2e45ab`](https://github.com/rizom-ai/brains/commit/b2e45ab653f68fb995821e84143d3be39e9a8dd5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - **LICENSE CHANGE.** The repository has moved from Apache-2.0 to a split licensing model. The SDK and theme packages — `@rizom/site`, `@rizom/site-sections`, `@rizom/theme-default`, `@rizom/theme-signal`, `@rizom/theme-rizom-ai` — remain **Apache-2.0**; the Rizom-owned site packages (`@rizom/site-docs`, `@rizom/site-rizom`, `@rizom/site-rizom-ai`, `@rizom/site-rizom-foundation`, `@rizom/site-rizom-work`) are now **AGPL-3.0-only**. Site packages built against the Apache-licensed interfaces are not considered derivative works of the runtime and may be licensed however their authors choose. Versions published before this release remain available under Apache-2.0.

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

## 0.2.0-alpha.161

## 0.2.0-alpha.160

### Patch Changes

- [`7a1d3a0`](https://github.com/rizom-ai/brains/commit/7a1d3a0417afba050565948dc3f1e7aadc4eff89) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Schema-first site sections: new `@rizom/site-sections` package authors a content
  section from a single zod schema (`defineSection` ties the component props to
  `z.infer<schema>`; `sectionGroup` bundles a namespace). The brain derives the
  CMS fields and the markdown formatter from the same schema by introspection, so
  there is no hand-written field DSL to keep in sync. `@rizom/site` carries the
  opaque `SiteSectionGroup` contract and `SiteDefinition.sections`;
  `createRizomSite` gains `sections` and `entityDisplay` options, `themeProfile`
  becomes optional (omit it to ship no profile canvas and no
  `data-theme-profile`), and `RizomFrame` gains a `canvas` prop to drop the dead
  canvas mount on profile-less sites.

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

### Minor Changes

- [`e789ec6`](https://github.com/rizom-ai/brains/commit/e789ec67cd3edc20ff1cf4ac9a7de08de0f415a5) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add the standalone `@rizom/site` authoring SDK and route the Rizom site packages through it for public route, content, layout, and site definition types.
