# @brains/linkedin-import

## 0.2.0-alpha.643

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.643
  - @brains/utils@0.2.0-alpha.643
  - @brains/plugins@0.2.0-alpha.643

## 0.2.0-alpha.642

### Patch Changes

- Updated dependencies [[`53da557`](https://github.com/rizom-ai/brains/commit/53da557991ad676545a4674600f0aca4c00fa1ba), [`fa7dd0e`](https://github.com/rizom-ai/brains/commit/fa7dd0e07df1d9d4fd74c8e9d9255220a5cfb628), [`2e10c13`](https://github.com/rizom-ai/brains/commit/2e10c1388c32a44d301dbf115dd169a4328b5acf), [`72403d7`](https://github.com/rizom-ai/brains/commit/72403d7d7ff7422f0a59db708955c267225ab7a3), [`386fc50`](https://github.com/rizom-ai/brains/commit/386fc505b04e29932e70cbda82171dacd915d494), [`821fdf7`](https://github.com/rizom-ai/brains/commit/821fdf7451ec6fb80ff3cd70d7164cd672aee288)]:
  - @brains/plugins@0.2.0-alpha.642
  - @brains/contracts@0.2.0-alpha.642
  - @brains/utils@0.2.0-alpha.642

## 0.2.0-alpha.641

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.641
  - @brains/utils@0.2.0-alpha.641
  - @brains/plugins@0.2.0-alpha.641

## 0.2.0-alpha.640

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.640
  - @brains/utils@0.2.0-alpha.640
  - @brains/plugins@0.2.0-alpha.640

## 0.2.0-alpha.639

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.639
  - @brains/utils@0.2.0-alpha.639
  - @brains/plugins@0.2.0-alpha.639

## 0.2.0-alpha.638

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.638
  - @brains/utils@0.2.0-alpha.638
  - @brains/plugins@0.2.0-alpha.638

## 0.2.0-alpha.637

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.637
  - @brains/utils@0.2.0-alpha.637
  - @brains/plugins@0.2.0-alpha.637

## 0.2.0-alpha.636

### Patch Changes

- Updated dependencies [[`11b7280`](https://github.com/rizom-ai/brains/commit/11b72805aacd377e1ea1db3b36109c57c541eca5)]:
  - @brains/contracts@0.2.0-alpha.636
  - @brains/plugins@0.2.0-alpha.636
  - @brains/utils@0.2.0-alpha.636

## 0.2.0-alpha.635

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.635
  - @brains/utils@0.2.0-alpha.635
  - @brains/plugins@0.2.0-alpha.635

## 0.2.0-alpha.634

### Patch Changes

- Updated dependencies []:
  - @brains/contracts@0.2.0-alpha.634
  - @brains/utils@0.2.0-alpha.634
  - @brains/plugins@0.2.0-alpha.634

## 0.2.0-alpha.633

### Patch Changes

- [#828](https://github.com/rizom-ai/brains/pull/828) [`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new opt-in `oauth-broker` plugin lets brains connect LinkedIn without their own LinkedIn app. One central brain holds the shared app and its single callback; each instance brain configures `plugins.linkedin-import.broker` (`url`, `instanceId`, `secret`, `returnUri` ending at `/linkedin/oauth/broker/return`) in place of `oauth`. Connecting starts at the broker, LinkedIn returns to the broker, and the broker sends the owner back with a two-minute, single-use grant that only that instance can redeem for the token. Each instance may start ten connections per ten minutes.
- Updated dependencies [[`a449334`](https://github.com/rizom-ai/brains/commit/a449334d9d2fd31f95a161444008e3ab5b959891)]:
  - @brains/contracts@0.2.0-alpha.633
  - @brains/utils@0.2.0-alpha.633
  - @brains/plugins@0.2.0-alpha.633

## 0.2.0-alpha.632

### Patch Changes

- [#827](https://github.com/rizom-ai/brains/pull/827) [`61b8521`](https://github.com/rizom-ai/brains/commit/61b85210dfa16fe0b0c5c59d3efcceeff0f00578) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A new opt-in `linkedin-import` plugin fills the owner's profile from LinkedIn. Add it with `add: [linkedin-import]` and the instance's LinkedIn app under `plugins.linkedin-import.oauth` (`clientId`, `clientSecret`, `redirectUri` ending at `/linkedin/oauth/callback`). The Anchor gets a LinkedIn workspace in Studio: Connect LinkedIn runs LinkedIn's consent flow and keeps the token in the Anchor's account settings, then the workspace shows each profile field next to LinkedIn's value. Empty fields and placeholders are filled, values the owner wrote are kept. Importing asks for confirmation and refuses when the profile changed since the preview. An Inspect LinkedIn data shapes action returns a redacted summary of the skills, positions, education and certifications domains, for writing their import fixtures.
- Updated dependencies []:
  - @brains/utils@0.2.0-alpha.632
  - @brains/plugins@0.2.0-alpha.632
