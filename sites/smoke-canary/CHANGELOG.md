# @rizom/site-smoke-canary

## 0.2.0-alpha.224

## 0.2.0-alpha.223

## 0.2.0-alpha.222

## 0.2.0-alpha.221

## 0.2.0-alpha.220

## 0.2.0-alpha.219

## 0.2.0-alpha.218

### Minor Changes

- [#66](https://github.com/rizom-ai/brains/pull/66) [`b840046`](https://github.com/rizom-ai/brains/commit/b8400466c02fa2c4b8b671a0467bea7a9577eab1) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Add a public Rover site/theme pair for the hosted external-package canary. The site uses only the documented `@rizom/brain/site` contract and ships a deterministic well-known marker; the signal theme composes the default theme with a high-contrast, light/dark instrument-panel visual system.

  Preserve the real personal/professional site plugin instances returned by `@rizom/brain/site` so externally authored packages retain required runtime lifecycle methods. Align the Chat SDK and all adapters on 4.34 to keep their private nominal types compatible during the release checks.
