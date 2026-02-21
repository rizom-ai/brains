# Brains Project Roadmap

Last Updated: 2026-02-21

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
- MCP interface (stdio + HTTP)
- Git sync and directory sync
- Sveltia CMS at `/admin/`
- Hetzner deployment with Docker
- Multi-theme support (brutalist, default, editorial, geometric, neo-retro, swiss)

---

## Current Focus: Post-v1.0 Improvements

### Discord Interface

- [ ] Implement Discord bot with threads, attachments, and message chunking (see `docs/plans/discord-interface.md`)

### Sveltia CMS

- [ ] Cloudflare Workers OAuth for multi-user GitHub auth

---

## Phase 2: Production Polish

- Performance optimization
- Mobile responsiveness review
- SEO improvements
- Accessibility audit

---

## Completed (2026-02)

- ✅ Extract site-content plugin from site-builder (entity, adapter, tools, orchestration via messaging)
- ✅ BaseEntityAdapter abstract class — migrated all 10 adapters to reduce boilerplate
- ✅ Route types moved to `@brains/plugins` (shared cross-plugin concern)
- ✅ LinkedIn organization posting support
- ✅ Professional site layout improvements (hero asymmetry, featured items, stacked variants)
- ✅ 5 theme variations (brutalist, editorial, geometric, neo-retro, swiss)
- ✅ Brutalist theme CRT terminal aesthetic elevation
- ✅ Content finalization: portfolio voice/backstory cleanup, Public Badges project added, URLs populated
- ✅ Removed technologies field from project schema
- ✅ Pagination dark mode fix (replaced theme-dependent CSS classes with Tailwind utilities)
- ✅ Code block mobile overflow fix (flex min-width constraint)
- ✅ Horizontal scrollbar flash fix (brutalist theme wave-divider overflow)
- ✅ Status badge readability fix (brutalist theme Industrial Tags rule)
- ✅ Favicon in Docker image (public/ directory in build context)
- ✅ Content-type-aware cache headers in preview server
- ✅ Image generation: GPT Image 1.5 + Gemini multi-provider, aspect ratios, AI prompt distillation, editorial illustration style
- ✅ CoverImage component with aspect-ratio-aware rendering and dimension propagation
- ✅ Embeddable flag to skip embeddings for image entities
- ✅ Global image provider config (`defaultImageProvider` with auto-detection)
- ✅ Git sync: event-driven commit/push, subprocess optimization, ServicePlugin conversion
- ✅ Sveltia CMS at `/admin/` with autoSync
- ✅ Frontmatter schema normalization (deck, project, link, newsletter, social post)
- ✅ Job monitoring memory leak fix (newsletter, social-media)

## Completed (2026-01)

- ✅ Dashboard plugin with extensible widgets
- ✅ Social media auto-generate on blog publish
- ✅ Newsletter plugin (Buttondown integration)
- ✅ Newsletter generation tool (AI-powered, job-based)
- ✅ Newsletter agent evals (tool invocation tests)
- ✅ NewsletterSignup UI component
- ✅ Newsletter signup on site (API routes, footer slot)
- ✅ Publish pipeline (queue, schedule, execute)
- ✅ Deploy script consolidation
- ✅ Docker build optimization
- ✅ Image plugin (cover images, alt text)
- ✅ Decks cover image support
- ✅ AI SDK v6 stabilization
- ✅ Plugin test coverage
- ✅ Content-pipeline rename (publish-pipeline → content-pipeline)
- ✅ Generation scheduling (newsletters, social posts)
- ✅ TestSchedulerBackend for deterministic testing
- ✅ Buttondown API fix (about_to_send status)

---

## Future Considerations

- **Astro Site Builder**: Alternative SSG with content collections (see `docs/plans/site-builder-astro.md`)
- **Team Brain**: Shared knowledge bases
- **Collective Brain**: Community knowledge networks
- **Web UI**: Browser interface beyond static site
- **Additional Interfaces**: Slack, WhatsApp
