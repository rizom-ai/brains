# Brains Project Roadmap

Last Updated: 2025-01-22

## Current Focus: Professional-Brain Release

The immediate priority is releasing a production-ready version of professional-brain (Rover) - a personal knowledge platform for independent professionals.

---

## Phase 0: Professional-Brain v1.0

**Goal**: Clean, stable release without newsletter functionality.

### What's Working

- Site builder with Preact SSR and Tailwind CSS v4
- Blog plugin with essays, series, RSS feeds
- Decks plugin for presentations
- Portfolio plugin for case studies
- Topics plugin for AI-powered tagging
- Links plugin for bookmarks
- Notes plugin for drafts
- Social media plugin for post generation
- Analytics (Cloudflare integration)
- Matrix bot interface
- MCP interface (stdio + HTTP)
- Git sync for version control
- Directory sync for file-based editing

### To Complete

- [ ] Review and fix any broken functionality
- [ ] Ensure all templates render correctly
- [ ] Verify deployment pipeline works
- [ ] Update documentation
- [ ] Tag v1.0 release

### Out of Scope (Phase 0)

- Newsletter signup/integration
- API routes for forms
- CTA slot system

---

## Phase 1: API Infrastructure

**Goal**: Extensible API route system for plugins.

### Deliverables

- Plugin-declared API routes (`static apiRoutes` on ServicePlugin)
- API route registry in `@brains/plugins`
- Route handler in MCP HTTP server
- Webserver proxy (`/api/*` → MCP)
- Auth support (public vs authenticated routes)

### Key Files

- `shell/plugins/src/types/api-routes.ts`
- `shell/plugins/src/registries/api-route-registry.ts`
- `interfaces/mcp/src/api/route-handler.ts`
- `interfaces/webserver/src/server-manager.ts`

### Plan

See `docs/plans/newsletter-integration.md` (Part 1-3)

---

## Phase 2: Newsletter Integration

**Goal**: Newsletter signup on professional-brain site.

### Deliverables

- Newsletter plugin API route exposed
- CTA slot system (link vs newsletter types)
- Footer integration with optional CTA
- Thank-you/error pages
- Professional-brain config updated

### Key Files

- `plugins/newsletter/src/index.ts` (add apiRoutes)
- `shared/ui-library/src/CTASlot.tsx`
- `shared/default-site-content/src/footer.tsx`
- `apps/professional-brain/brain.config.ts`

### Plan

See `docs/plans/newsletter-integration.md` (Part 4-5)

---

## Phase 3: Cloudflare Migration

**Goal**: Cloudflare as default CDN, Bunny.net as alternative.

### Deliverables

- Cloudflare CDN/DNS Terraform module
- Provider selection in deployment config
- Zero-downtime migration path from Bunny
- Updated deployment documentation

### Plan

See `docs/plans/cloudflare-migration.md`

---

## Phase 4: Production Polish

**Goal**: Professional-brain ready for real users.

### Potential Items

- Performance optimization
- Error handling improvements
- Mobile responsiveness review
- SEO optimization
- Accessibility audit
- Monitoring and alerting

---

## Completed

### 2025-01

- ✅ Newsletter plugin (Buttondown integration)
- ✅ NewsletterSignup UI component
- ✅ Deploy script consolidation
- ✅ Docker build optimization
- ✅ Image plugin improvements (cover images, alt text)

### 2024 (Previous)

- ✅ Core plugin architecture
- ✅ Entity framework with Zod schemas
- ✅ Site builder with Preact + Tailwind
- ✅ Blog, Decks, Portfolio, Topics plugins
- ✅ MCP interface (stdio + HTTP)
- ✅ Matrix bot interface
- ✅ Conversation memory
- ✅ Job queue with progress tracking
- ✅ Git sync and directory sync
- ✅ Centralized permissions
- ✅ Hetzner deployment with Terraform

---

## Future Considerations

These are not currently planned but may be explored later:

- **Team Brain**: Shared knowledge bases for teams
- **Collective Brain**: Community-driven knowledge networks
- **Web UI**: Browser-based interface beyond static site
- **Mobile App**: Native or PWA mobile experience
- **Additional Interfaces**: Discord, Slack, WhatsApp
- **Roadmap Plugin**: Goal tracking and milestone management
