# @rizom/site-sections

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
- Updated dependencies [[`7a1d3a0`](https://github.com/rizom-ai/brains/commit/7a1d3a0417afba050565948dc3f1e7aadc4eff89)]:
  - @rizom/site@0.2.0-alpha.160
