# @brains/console-theme

## 0.2.0-alpha.154

## 0.2.0-alpha.153

## 0.2.0-alpha.152

## 0.2.0-alpha.151

## 0.2.0-alpha.150

## 0.2.0-alpha.149

### Patch Changes

- [`70ff530`](https://github.com/rizom-ai/brains/commit/70ff53084c5bb8d021e2a4f898e108b2de220d2a) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Align the operator console with the canonical navy instrument and warm paper mockups, and add deliberate tablet and phone compositions across the shared strip, command palette, dashboard, chat shell, and CMS editor. Refactor responsive styles into surface-local modules, make CMS controls climate-safe, and preserve the historical and responsive console mockups as implementation references.

## 0.2.0-alpha.148

### Patch Changes

- [`f7054af`](https://github.com/rizom-ai/brains/commit/f7054af14705adb7690def03c70009bf95b91b8b) Thanks [@yeehaa123](https://github.com/yeehaa123)! - The CMS editor joins the console: its shell serves the shared
  @brains/console-theme sheet (paper climate default, console-wide
  console.climate preference wins) and the console strip with route-derived
  surface links; the appbar slims to a surface-local crumb bar; the local
  paper palette and IBM Plex Mono are replaced by console tokens and
  JetBrains Mono. The strip's HTML renderer and the console fonts URL move
  into @brains/console-theme, shared by web-chat and the CMS shell.

- [`d4e0245`](https://github.com/rizom-ai/brains/commit/d4e0245a37741bed6cfd7d588b77f951e36e38f2) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Cross-surface ⌘K jump: an operator-gated /api/console/jump endpoint on
  the dashboard returns grouped doors (entity search hits open in the CMS
  editor via hash deep-links, widget groups open dashboard tabs), and a
  shared vanilla palette in @brains/console-theme — wired to the strip's
  ⌘K on all three surfaces — renders them. The CMS editor honors
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
