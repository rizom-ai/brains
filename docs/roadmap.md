# Brains Project Roadmap

Last Updated: 2025-02-13

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

### Git Sync — Event-Driven Commit/Push

- [x] Subscribe to entity events (`entity:created`/`updated`/`deleted`) with debounced commit+push (see `docs/plans/git-sync-event-driven.md`)

### Discord Interface

- [ ] Implement Discord bot with threads, attachments, and message chunking (see `docs/plans/discord-interface.md`)

### Image Generation — Multi-Provider

- [ ] Add Nano Banana Pro (Gemini 3 Pro Image) alongside DALL-E 3 (see `docs/plans/image-multi-provider.md`)
- [ ] Switch from pixel sizes to aspect ratios (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`)
- [ ] Global provider config (`defaultImageProvider` in brain.config.ts)
- [ ] Better text rendering for cover images via Nano Banana Pro's native capabilities

### Frontmatter Schema Normalization

- [ ] Normalize deck, project, link adapter schemas to consistent pattern (see `docs/plans/frontmatter-normalization.md`)

### Newsletter Plugin Cleanup

- [ ] Frontmatter schema normalization, fix partial entity hack, fix hard-coded entity type, add missing tests (see `docs/plans/newsletter-cleanup.md`)

### Job Monitoring Memory Leak

- [ ] Replace per-job subscriptions with centralized handler in newsletter and social-media plugins

### Sveltia CMS — Git-Based Content Management

- [ ] Add Sveltia CMS at `/admin/` for web-based editing of all entity types (see `docs/plans/sveltia-cms.md`)
- [ ] Cloudflare Workers OAuth for multi-user GitHub auth
- [ ] Enable `autoSync` in git-sync for CMS→brain data flow

---

## Phase 2: Production Polish

- Performance optimization
- Mobile responsiveness review
- SEO improvements
- Accessibility audit

---

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
