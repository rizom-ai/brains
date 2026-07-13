# @rizom/site

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
