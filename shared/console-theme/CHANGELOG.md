# @brains/console-theme

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

- [`f6dc969`](https://github.com/rizom-ai/brains/commit/f6dc96973a64c3f40694ae80fe4529a20d423e5d) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Bring Chat and CMS into the approved console visual language. Chat gains a compact conversation index and responsive composer while removing its parallel surface-token palette; CMS now applies the detailed editorial palette, IBM Plex Mono source treatment, grouped library metadata, manuscript typography, responsive Details/Write/Preview styling, authored image/date/toggle/tag widgets, conflict feedback, and a recoverable delete dialog. The shared font payload includes the CMS editorial mono face.

- [`b13774a`](https://github.com/rizom-ai/brains/commit/b13774afda0ba85356ab07ee29cdd09b19071054) Thanks [@yeehaa123](https://github.com/yeehaa123)! - Operator-review fixes across the console: the climate toggle moves into the shared strip on all three surfaces (replacing the dashboard masthead button and chat's local toggle), the session chip gains a neutral visitor variant and quiet phone treatment, sign-in controls adopt the console button language, and the CMS library groups brain machinery under a System rail section, hides publication chips for types without a publication lifecycle, and repairs the phone type pills and row meta alignment.

## 0.2.0-alpha.156

## 0.2.0-alpha.155

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
