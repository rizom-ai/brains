# Brains Project Roadmap

Last Updated: 2026-02-18

---

## Current Focus: Professional-Brain v1.0

**Goal**: Launch yeehaa.io with complete content and working features.

### Remaining for v1.0

- [x] Social media auto-generate: Triggers on blog post status → queued
- [x] Publish pipeline: Verify queue/schedule/publish flow
- [x] Newsletter signup on site (form → Buttondown API)
- [x] Newsletter generation tool with agent evals
- [ ] Content: Finalize essays, portfolio, about (last step)

### Recently Fixed

- ✅ Series: Auto-generate summary and cover image (enhance-series tool, image_generate with target params)
- ✅ Dashboard: Analytics widgets (Top Pages, Traffic Sources, Devices, Countries)

- ✅ Dashboard widget registration timing
- ✅ Hydration compilation centralized in site-builder
- ✅ Site build permissions on Hetzner
- ✅ Topics extraction
- ✅ Social post data validation

### What's Working

- Site builder with Preact SSR and Tailwind CSS v4
- Blog with essays, series, RSS feeds
- Decks with cover images
- Portfolio case studies
- Topics (AI-powered tagging)
- Links and Notes
- Social media plugin (LinkedIn generation)
- Newsletter plugin (generation, signup, Buttondown integration)
- Analytics plugin (Cloudflare)
- Dashboard plugin (widget system)
- Matrix bot interface
- MCP interface (stdio + HTTP)
- Git sync and directory sync
- Hetzner deployment

---

## Phase 1: Post-v1.0 Improvements

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

- ✅ Image generation: GPT Image 1.5 + Gemini multi-provider, aspect ratios, AI prompt distillation, editorial illustration style
- ✅ CoverImage component with aspect-ratio-aware rendering and dimension propagation
- ✅ Embeddable flag to skip embeddings for image entities
- ✅ Global image provider config (`defaultImageProvider` with auto-detection)
- ✅ Git sync: event-driven commit/push, subprocess optimization, ServicePlugin conversion
- ✅ Sveltia CMS at `/admin/` with autoSync
- ✅ Frontmatter schema normalization (deck, project, link, newsletter, social post)
- ✅ Job monitoring memory leak fix (newsletter, social-media)

## Completed (2025-01)

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
