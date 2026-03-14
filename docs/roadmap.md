# Brains Project Roadmap

Last Updated: 2026-03-14

---

## Professional-Brain v1.0 ✅

**Goal**: Launch yeehaa.io with complete content and working features.

**Status**: Complete. All features shipped, content finalized.

### What's Shipped

- Site builder with Preact SSR and Tailwind CSS v4
- Blog with 17 essays, 3 series, RSS feeds
- Decks with cover images
- Portfolio with 8 case studies
- Topics (AI-powered tagging)
- Links and Notes
- Social media plugin (LinkedIn generation, auto-generate on publish)
- Newsletter plugin (generation, signup, Buttondown integration)
- Analytics plugin (Cloudflare)
- Dashboard plugin (widget system)
- Matrix bot interface
- Discord bot interface
- MCP interface (stdio + HTTP)
- Git sync and directory sync
- Sveltia CMS at `/admin/`
- Hetzner deployment with Docker
- Multi-theme support (brutalist, default, editorial, geometric, neo-retro, swiss, yeehaa)

---

## Codebase Refactor ✅

**Goal**: Reduce duplication, improve architecture, establish patterns for growth.

**Status**: Complete (2026-03-14). 12 of 15 items done, 1 skipped, 2 deferred.

### What's Done

- Brain model / instance split (`defineBrain()` + `resolve()` + `brains/` workspace)
- `layouts/` workspace for site composition layers
- `BaseGenerationJobHandler` — 6 handlers converted, 781 lines eliminated
- `BaseEntityDataSource` — 7 datasources converted, 389 lines eliminated
- `EntityMutations` extraction — EntityService 677→260 lines
- `@brains/theme-base` with `composeTheme()` — 1689 lines eliminated across 7 themes
- Barrel export cleanup — 50% reduction (229→~115 exports)
- Cross-plugin dependencies resolved
- Lazy interface loading — skip unconfigured Matrix/Discord
- Lint warnings eliminated (0 warnings across 56 tasks)
- **Total: ~2,860 lines eliminated**

### Deferred

- MockShell cleanup ([plan](./plans/2026-03-14-mockshell-cleanup.md)) — do when `IShell` interface next changes
- Matrix interface monolith — do when Matrix needs feature work

---

## Current Focus: Production Polish

- Performance optimization
- Mobile responsiveness review
- SEO improvements
- Accessibility audit
- Sveltia CMS: Cloudflare Workers OAuth for multi-user GitHub auth

---

## Completed (2026-03)

- ✅ Codebase refactor (see above)
- ✅ Series metadata + cover images for 3 blog series
- ✅ Architecture docs rewrite
- ✅ Deck/Post schema consistency
- ✅ Obsidian content creation frontend: template sync, body templates, Metadata Menu fileClasses
- ✅ Bases integration: per-entity views, Pipeline, Settings for singletons
- ✅ Sync improvements: disk edits win, canonical hash eliminates re-import cycle
- ✅ External routes: navigation-only links excluded from site builds
- ✅ Wishlist plugin added to professional brain
- ✅ Pipeline widget mobile overflow fix
- ✅ Dashboard auto-discovered URLs
- ✅ Pre-compiled hydration for faster site builds
- ✅ MCP multi-session support fix
- ✅ ESLint centralized configuration
- ✅ Interactive pipeline widget on dashboard

## Completed (2026-02)

- ✅ Discord bot interface with threads, attachments, message chunking, constructor DI
- ✅ Interface test cleanup: removed type casts and global mocks from Discord + Matrix tests
- ✅ File upload support for chat interfaces
- ✅ Note plugin: slugified IDs, frontmatter-aware content handling
- ✅ Extract site-content plugin from site-builder
- ✅ BaseEntityAdapter abstract class — migrated all 10 adapters
- ✅ Route types moved to `@brains/plugins`
- ✅ LinkedIn organization posting support
- ✅ Professional site layout improvements
- ✅ 5 theme variations (brutalist, editorial, geometric, neo-retro, swiss)
- ✅ Content finalization: portfolio voice/backstory cleanup
- ✅ Image generation: GPT Image 1.5 + Gemini multi-provider
- ✅ CoverImage component with aspect-ratio-aware rendering
- ✅ Git sync: event-driven commit/push, subprocess optimization
- ✅ Sveltia CMS at `/admin/` with autoSync
- ✅ Frontmatter schema normalization
- ✅ Job monitoring memory leak fix

## Completed (2026-01)

- ✅ Dashboard plugin with extensible widgets
- ✅ Social media auto-generate on blog publish
- ✅ Newsletter plugin (Buttondown integration)
- ✅ Newsletter generation tool (AI-powered, job-based)
- ✅ Publish pipeline (queue, schedule, execute)
- ✅ Deploy script consolidation
- ✅ Docker build optimization
- ✅ Image plugin (cover images, alt text)
- ✅ AI SDK v6 stabilization
- ✅ Generation scheduling (newsletters, social posts)

---

## Future Considerations

- **Cloudflare CDN**: Alternative to Bunny.net ([plan](./plans/cloudflare-migration.md))
- **Web UI**: Browser interface beyond static site
- **Obsidian Community Plugin**: Chat, publish, generate from inside Obsidian via MCP HTTP
- **Additional Interfaces**: Slack, WhatsApp, Telegram
