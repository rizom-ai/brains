---
"@rizom/brain": patch
"@rizom/brain-ui": patch
"@rizom/ops": patch
"@brains/build-tools": patch
---

Every package a release publishes lands on the `latest` dist-tag, the tag third parties install. In prerelease mode changesets chose each package's tag from its registry history: `latest` while every published version was an alpha, `alpha` once any other version existed. The `0.0.0-stage` placeholder left by `@rizom/brain-ui`'s trusted-publishing bootstrap sent it to `alpha` at alpha.650 while `@rizom/brain` and `@rizom/ops` went to `latest`, so `npm install @rizom/brain-ui` got alpha.649. The publish wrapper now sets the prerelease state aside for the publish in both lanes, which leaves `latest` for every package; the thefourth site and theme, whose `latest` stayed at alpha.1 the same way, follow from their next site release.
