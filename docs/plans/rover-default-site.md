# Plan: Minimal Rover Default Site Package + Seed Content

## Context

Rover is a professional brain with blog, decks, portfolio, topics, newsletter, social media, and content pipeline. But it defaults to `@brains/site-default` — a bare-bones site with only `DefaultLayout` and `post: { label: "Post" }`. A new user gets an underwhelming experience until they manually override to `@brains/site-yeehaa` (which is yeehaa-branded).

**Goal**: Create `@brains/site-rover-default` — a neutral, clean professional site package that rover uses by default. Update seed content so the site looks good on first boot.

## Step 1: Create `shared/theme-rover/` (minimal theme)

Minimal rizom-branded theme. Same brand identity as theme-default (blue/orange palette, Plus Jakarta Sans + Space Grotesk fonts) but stripped of all decorative CSS.

- **`shared/theme-rover/package.json`** — dep: `@brains/theme-base`
- **`shared/theme-rover/src/types.d.ts`** — CSS module declaration (same as other themes)
- **`shared/theme-rover/src/index.ts`** — `composeTheme(themeCSSOnly)` pattern
- **`shared/theme-rover/src/theme.css`** — derived from theme-default, keeping:
  - Google Font imports (Plus Jakarta Sans, Space Grotesk)
  - Rizom color palette (blue #3921D7, orange #E7640A, neutrals)
  - Light + dark mode semantic tokens
  - Prose styles (heading colors/fonts, paragraph colors, code blocks)
  - Basic utilities: `.form-input`, `.btn-primary`, `.focus-ring`
  - Nav/header/logo/toggle dark mode behavior
- **Removed** from theme-default:
  - Gradients (`--color-bg-gradient`, `--color-gradient-start/end`)
  - Hero dot patterns (`.hero-bg-pattern`, `.cta-bg-pattern`)
  - Blob animations (`@keyframes blob`, `.animate-blob`, delay classes)
  - Marquee animations (`@keyframes marquee/marquee-reverse`, `.animate-marquee*`)
  - Hero stagger animations (`@keyframes hero-fade-up`, `.hero-stagger-*`)

## Step 2: Create `sites/rover-default/`

New site package following the exact `sites/yeehaa/` pattern:

- **`sites/rover-default/package.json`** — deps: `@brains/layout-professional`, `@brains/theme-rover`, `@brains/app`, `@brains/plugins`, `preact`
- **`sites/rover-default/tsconfig.json`** — standard JSX config extending base
- **`sites/rover-default/src/index.ts`** — exports a `SitePackage`:
  - **Theme**: `@brains/theme-rover` (minimal, system fonts)
  - **Layout**: `ProfessionalLayout` from `@brains/layout-professional`
  - **Routes**: professional routes from `@brains/layout-professional`
  - **Plugin**: `professionalSitePlugin`
  - **Entity route config**: neutral labels — Post (not Essay), Deck (not Presentation), Project, Series, Topic, Link, Note (hidden), Social Post, Newsletter

## Step 3: Update Rover brain model

In `brains/rover/src/index.ts`:

- Change import from `@brains/site-default` to `@brains/site-rover-default`

In `brains/rover/package.json`:

- Replace `@brains/site-default` dep with `@brains/site-rover-default`

## Step 4: Update Rover seed content

Make the site look presentable and inviting on first boot. Tone: playful, encouraging, with personality — not corporate template speak.

- **`post/my-first-post.md`** — published, warm welcome post. Conversational tone: "Hey, you made it!" vibe. Explain what Rover can do in a friendly way, not a feature list.
- **`deck/my-first-deck.md`** — published, a fun "Hello World" presentation with a few slides that show what decks look like and encourage the user to make their own.
- **Add `project/sample-project.md`** — published sample portfolio project. Frame it as "Your First Case Study" — playful placeholder that shows the structure without being dry.
- **`site-info/site-info.md`** — update title to something warmer than "My Site" (e.g. "Welcome" or "Your Corner of the Internet")
- **`anchor-profile/anchor-profile.md`** — keep the placeholder structure but make example text more fun (e.g. "Professional cat herder" instead of "Your Field")
- **`README.md`** — add project/ to the directory listing

## Key files

| File                                                  | Action                                   |
| ----------------------------------------------------- | ---------------------------------------- |
| `shared/theme-rover/package.json`                     | Create                                   |
| `shared/theme-rover/src/types.d.ts`                   | Create                                   |
| `shared/theme-rover/src/index.ts`                     | Create                                   |
| `shared/theme-rover/src/theme.css`                    | Create                                   |
| `shared/theme-rover/tsconfig.json`                    | Create                                   |
| `sites/rover-default/package.json`                    | Create                                   |
| `sites/rover-default/tsconfig.json`                   | Create                                   |
| `sites/rover-default/src/index.ts`                    | Create                                   |
| `brains/rover/src/index.ts`                           | Change site-default → site-rover-default |
| `brains/rover/package.json`                           | Change dep                               |
| `brains/rover/seed-content/post/my-first-post.md`     | Update to published                      |
| `brains/rover/seed-content/deck/my-first-deck.md`     | Update to published                      |
| `brains/rover/seed-content/project/sample-project.md` | Create                                   |
| `brains/rover/seed-content/site-info/site-info.md`    | Update title                             |
| `brains/rover/seed-content/README.md`                 | Add project/                             |

## Why not improve `@brains/site-default`?

`site-default` uses `DefaultLayout` and is the baseline for ALL brain types (rover, ranger, relay). Changing it to use `ProfessionalLayout` would break ranger and relay, which don't have blog/decks dependencies.

## Why `site-rover-default`?

Makes it clear this is the default for the rover brain model. Still a standalone package that other professional brains could reference if they want the same setup.

## Verification

1. `bun install` (picks up new workspace package)
2. `bun run typecheck`
3. `bun run lint`
4. `bun test`
5. Start professional-brain locally, verify site renders with professional layout and published seed content
