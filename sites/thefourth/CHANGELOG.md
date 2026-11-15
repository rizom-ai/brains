# @rizom/site-thefourth

## 0.2.0-alpha.14

### Patch Changes

- Updated dependencies [[`a6da1fa`](https://github.com/rizom-ai/brains/commit/a6da1fa75278644cf8217d8ddceedcddb5154003)]:
  - @rizom/site@0.2.0-alpha.246

## 0.2.0-alpha.13

### Patch Changes

- [#857](https://github.com/rizom-ai/brains/pull/857) [`b48235b`](https://github.com/rizom-ai/brains/commit/b48235b1589bfcfe46398086b35a678ae0ac7863) Thanks [@yeehaa123](https://github.com/yeehaa123)! - A site route may name the languages its plugin fills it in per request (`languages`); the site builds the page in each without saved copy, so a form's pages exist in every language it is translated to. The Fourth dresses the brain's forms, the brand test among them, on its paper stage: each step a card, each answer a cut-out that turns mustard when picked, its ink pills for buttons and its red for errors. Deploy with the brain release that serves forms from content.
- Updated dependencies [[`b48235b`](https://github.com/rizom-ai/brains/commit/b48235b1589bfcfe46398086b35a678ae0ac7863)]:
  - @rizom/site@0.2.0-alpha.245

## 0.2.0-alpha.12

### Patch Changes

- Updated dependencies [[`60bd903`](https://github.com/rizom-ai/brains/commit/60bd90309108aaa24bf8597d8245260dbc479e39)]:
  - @rizom/site@0.2.0-alpha.244

## 0.2.0-alpha.11

### Patch Changes

- [#835](https://github.com/rizom-ai/brains/pull/835) [`804a82c`](https://github.com/rizom-ai/brains/commit/804a82c4759f9301bf3fc38948d4529b7c877251) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `SiteLayoutInfo` carries the anchor's `photo`. The Fourth's footer follows Sam's mockup: the wordmark beside the profiles, stacked, and the email; then the anchor's photo, the places of the privacy, terms and cookie pages, and the language switch as a pill over the copyright and the credit to Rizom.
- Updated dependencies [[`804a82c`](https://github.com/rizom-ai/brains/commit/804a82c4759f9301bf3fc38948d4529b7c877251)]:
  - @rizom/site@0.2.0-alpha.243

## 0.2.0-alpha.10

### Patch Changes

- [#832](https://github.com/rizom-ai/brains/pull/832) [`e760242`](https://github.com/rizom-ai/brains/commit/e76024214dbe73dda4eb588cfb487fee6ab190c4) Thanks [@yeehaa123](https://github.com/yeehaa123)! - `@rizom/site` exports `SocialLinkPlatform` and `SOCIAL_LINK_PLATFORM_LABELS`, and a layout's social links can name a podcast. The docs and Rizom sites name their links from that one list.

  The Fourth's homepage follows Sam's one-page design. Act I has one way on, "How it works", and no thread on the key's tag. Act III names each program in bold. Act IV pins the clients' words on paper beside the stories, Rizom's on the right and TWTN's on the left, with no links on the cards. The epilogue introduces the team: each guide's portrait, name, bio and areas of expertise, stacked on a phone, with no button. The footer lists the brain's profiles (each in a new tab) and credits Rizom in place of the city line.

- Updated dependencies [[`e760242`](https://github.com/rizom-ai/brains/commit/e76024214dbe73dda4eb588cfb487fee6ab190c4)]:
  - @rizom/site@0.2.0-alpha.242

## 0.2.0-alpha.9

### Patch Changes

- [#802](https://github.com/rizom-ai/brains/pull/802) [`86b4c58`](https://github.com/rizom-ai/brains/commit/86b4c582c2cb4982aef3995f38f054e6cea34d70) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Breaking: a route places a schema-first section by its runtime name, `namespace:name` (`home:hero`), the same form every template has. The dotted `home.hero` was rewritten by `defineSite()` only, so a site exported without it rendered nothing for those sections; it is now rejected with the colon spelling to use. `defineSite()` still makes `content.home.hero` the fallback of the section placed as `home:hero`, and validation messages name sections the same way. The bundled sites use the colon form.
- Updated dependencies [[`86b4c58`](https://github.com/rizom-ai/brains/commit/86b4c582c2cb4982aef3995f38f054e6cea34d70)]:
  - @rizom/site@0.2.0-alpha.241

## 0.2.0-alpha.8

### Minor Changes

- [#780](https://github.com/rizom-ai/brains/pull/780) [`afb1d14`](https://github.com/rizom-ai/brains/commit/afb1d14416a96fcc5db928f2436a6eed2c4ab67b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's site is built in English and Traditional Chinese (`languages: ["en", "zh-TW"]`); a page appears in Chinese once its Chinese copy and site-info's Chinese chrome are in the brain. The header shows an EN / 中文 switch on pages that exist in both languages, the footer signs off in the page's language, and Chinese pages set their characters in Noto Sans TC and Noto Serif TC, loaded only on them. The signposts' words are now crossroads copy (`signs`), and an Act II spell in a language written without spaces lists its words (`words`). Needs `@rizom/brain` 0.2.0-alpha.608 or later.

## 0.2.0-alpha.7

### Patch Changes

- Updated dependencies [[`66de6ee`](https://github.com/rizom-ai/brains/commit/66de6ee6c8c1a29d5b4d9220dcc7375dd5e679b0)]:
  - @rizom/site@0.2.0-alpha.240

## 0.2.0-alpha.6

### Patch Changes

- [#774](https://github.com/rizom-ai/brains/pull/774) [`50eb8df`](https://github.com/rizom-ai/brains/commit/50eb8df73a1efb55b3b077bca03a1afe1306bd31) Thanks [@yeehaa123](https://github.com/yeehaa123)! - No hairline of paper shows between the cover and Act I on screens where 24vh is a fraction of a pixel: Act I's red now starts 2px before the cover ends.

## 0.2.0-alpha.5

### Minor Changes

- [#773](https://github.com/rizom-ai/brains/pull/773) [`aee1d38`](https://github.com/rizom-ai/brains/commit/aee1d38766022b71e17207124e1f4da5f371b9c7) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage follows Sam's updated Paper theatre design. The cover reads "Unlocking Marketing Secrets for the Innovators, Creatives & Pioneers" under a scalloped valance, with seven keys that fly into the keyhole as the visitor scrolls. Act I rises over the cover with a key's tag, "Start with a diagnosis" and "How it works"; Act II's button is "Unlock it" and its translation offers "Unlock yours"; Act III's three ways in carry an eye, a talking screen and a handset; Act IV ends on "Unlock yours"; the crossroads is one signpost hung with advice; the epilogue shows the guides by name; and the footer is red, with the name, the email, the city and the copyright. Buttons lift and links thicken under the wand, focus rings are mustard and the sparks are mustard. Content saved for the cover, Act I, Act II, Act III, Act IV, the crossroads and the epilogue needs the new fields.

## 0.2.0-alpha.4

### Patch Changes

- [#762](https://github.com/rizom-ai/brains/pull/762) [`a127fb2`](https://github.com/rizom-ai/brains/commit/a127fb29720eda8a4055dfb58b1ee18cc8fb9248) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage tells Act IV, the fourth act: the stories pinned as tilted cards, the New Taipei City Art Museum's feature figure, two more figures (the second in ink) and Rizom's story on red with the jargon struck out and its photo across the top when the content names one.

- [#762](https://github.com/rizom-ai/brains/pull/762) [`a127fb2`](https://github.com/rizom-ai/brains/commit/a127fb29720eda8a4055dfb58b1ee18cc8fb9248) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage ends at the crossroads, "Which way?" under a spotlight among swinging signposts (the brand test appears once it has a link), and the epilogue: every hero needs a guide, the two guides swaying on sticks as keyhole portraits when the brain has them, and the fourth act starting by email.

- [#762](https://github.com/rizom-ai/brains/pull/762) [`a127fb2`](https://github.com/rizom-ai/brains/commit/a127fb29720eda8a4055dfb58b1ee18cc8fb9248) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage moves as the design does: acts rise into view, the paper props drift as the page scrolls, the pointer is a wand trailing sparks; reduced motion and touch screens get the still page.

## 0.2.0-alpha.3

### Patch Changes

- [#761](https://github.com/rizom-ai/brains/pull/761) [`4e4d31b`](https://github.com/rizom-ai/brains/commit/4e4d31bc1afa91cb6a2b3aac8111edc73454206e) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage tells Act III, enter the guide: the three spells, See, Tell and Reach, each a giant word on a mint disc with its mark (a magnifying glass, a lantern, a paper plane), alternating sides, and the worlds The Fourth works in as labels.

## 0.2.0-alpha.2

### Patch Changes

- [#760](https://github.com/rizom-ai/brains/pull/760) [`5883d2e`](https://github.com/rizom-ai/brains/commit/5883d2ea25d16b11e74b4342cfe66807a0d38931) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The Fourth's homepage tells its first two acts. Act I, the hero, opens on red with the hero's work beside a paper arch, a balloon and an optional photo cut out as a keyhole (`![alt](entity://image/<id>)` in its content). Act II, the curse of jargon, says a true sentence nobody listened to: "Break the spell" scatters its words and strikes out the jargon, then a keyhole opens onto the translation in the spell's color, and "Try another spell" moves through the spells. Without JavaScript the sentence stands alone; with reduced motion the translation simply appears.

## 0.2.0-alpha.1

### Patch Changes

- [#759](https://github.com/rizom-ai/brains/pull/759) [`0a1cd98`](https://github.com/rizom-ai/brains/commit/0a1cd98a36c3ffc8a2b6314932c8d2f856eefd88) Thanks [@yeehaa123](https://github.com/yeehaa123)! - New site and theme for The Fourth, a brand consultancy in Taipei: the homepage opens on a paper stage between two curtains, with a red keyhole the visitor steps through as they scroll, under a header with the logo and the site's call to action and a footer with the sign-off and the email. The theme carries the paper, the ink, the stage lights and the type.
