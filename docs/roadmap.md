# Brains Project Roadmap

Last Updated: 2025-01-26

---

## Current Focus: Professional-Brain v1.0

**Goal**: Launch yeehaa.io with complete content and working features.

### Remaining for v1.0

- [x] Social media auto-generate: Triggers on blog post status → queued
- [ ] Publish pipeline: Verify queue/schedule/publish flow
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
- Analytics plugin (Cloudflare)
- Dashboard plugin (widget system)
- Matrix bot interface
- MCP interface (stdio + HTTP)
- Git sync and directory sync
- Hetzner deployment

---

## Phase 1: Post-v1.0 Improvements

### Discord Interface

- [ ] Implement Discord bot (see `docs/plans/discord-interface.md`)

### Image Generation Provider

- [ ] Add Nano Banana Pro (Google Gemini) as alternative to DALL-E
- [ ] Make provider configurable: `IMAGE_PROVIDER=google|openai`
- [ ] Better text rendering for cover images with titles

---

## Phase 2: Newsletter Integration

**Goal**: Newsletter signup on site.

### Requires

- API routes infrastructure (plugin-declared routes)
- MCP HTTP route handler
- Webserver proxy (`/api/*`)

### Deliverables

- Newsletter plugin API route
- CTA slot in footer
- Thank-you/error pages

### Plan

See `docs/plans/newsletter-integration.md`

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
- ✅ NewsletterSignup UI component
- ✅ Publish pipeline (queue, schedule, execute)
- ✅ Deploy script consolidation
- ✅ Docker build optimization
- ✅ Image plugin (cover images, alt text)
- ✅ Decks cover image support
- ✅ AI SDK v6 stabilization
- ✅ Plugin test coverage

---

## Future Considerations

- **Astro Site Builder**: Alternative SSG with content collections (see `docs/plans/site-builder-astro.md`)
- **Team Brain**: Shared knowledge bases
- **Collective Brain**: Community knowledge networks
- **Web UI**: Browser interface beyond static site
- **Additional Interfaces**: Slack, WhatsApp
