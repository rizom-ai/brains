# Professional-Brain v1.0 Release Plan

## Scope

Four items to complete before v1.0 release:

1. **Publish pipeline consistency** - Streamline all publishable entities through the same pipeline
2. **Social auto-generation** - Auto-create LinkedIn post when blog published
3. **Analytics dashboard** - Show stats on the site
4. **Newsletter publish-pipeline** - Newsletter entities should be publishable like everything else

Newsletter **signup/API integration** is out of scope (Phase 2).

---

## 1. Publish Pipeline Consistency

**Problem**: Publish-pipeline support is inconsistent across plugins:

1. Some plugins (Portfolio, Newsletter) have no publish-pipeline integration at all
2. Plugins that do integrate (Blog, Social-media, Decks) only support **direct publishing**, not queued/scheduled mode

**Current State**:

| Plugin       | `publish:register` | `publish:execute` | Direct Mode | Queued Mode |
| ------------ | ------------------ | ----------------- | ----------- | ----------- |
| Blog         | ✅                 | ✅                | ✅          | ❌          |
| Social-media | ✅                 | ✅                | ✅          | ❌          |
| Decks        | ✅                 | ✅                | ✅          | ❌          |
| Portfolio    | ✅                 | ✅                | ✅          | ❌          |
| Newsletter   | ✅                 | ✅                | ✅          | ❌          |

**Principle**: ALL publishable entity types follow the same pattern:

1. Register with `publish:register` (internal provider)
2. Subscribe to `publish:execute`
3. Support BOTH direct publish AND queued/scheduled modes

**Fix**:

1. Add publish-pipeline integration to Portfolio and Newsletter
2. Ensure all plugins properly handle queued/scheduled publishing (via entitySchedules config)
3. Test both modes for all entity types

**Files**:

- `plugins/portfolio/src/plugin.ts` - add integration
- `plugins/newsletter/src/plugin.ts` - add integration
- `plugins/publish-pipeline/src/plugin.ts` - verify scheduler config for all entity types

**Reference**: `plugins/blog/src/plugin.ts` lines 320-426

---

## 2. Newsletter Publish-Pipeline Integration

**Problem**: Newsletter plugin only reacts to `publish:completed` (to auto-send when posts are published). Newsletter entities themselves are not publishable through the pipeline.

**Fix**:

- Add `registerWithPublishPipeline()` for "newsletter" entity type
- Add `subscribeToPublishExecute()` to handle publishing
- Newsletter publishing = sending via Buttondown API

**Files**:

- `plugins/newsletter/src/plugin.ts`

**Note**: This is about making newsletters publishable entities. The newsletter signup/API routes are Phase 2.

---

## 3. Social Auto-Generation

**Problem**: User must manually call `social-media:generate` after publishing a blog post.

**Fix**:

- Subscribe to `publish:completed` in social-media plugin
- When entityType is "post", auto-generate LinkedIn post
- Optionally queue for publishing via publish-pipeline

**Files**:

- `plugins/social-media/src/plugin.ts`

**Reference**: Similar pattern to newsletter's `publish:completed` subscription

---

## 4. Analytics Dashboard

**Problem**: Analytics only accessible via MCP/CLI. No web display.

**Fix**:

- Create analytics dashboard template
- Show website stats (pageviews, visitors, bounce rate)
- Show social stats (impressions, engagement per post)
- Add route to professional-site

**Files**:

- `plugins/analytics/src/templates/` (new)
- `plugins/analytics/src/datasources/` (new or extend)
- `plugins/professional-site/src/routes.ts`

---

## Out of Scope (Phase 2)

- Newsletter signup/API routes integration
- Additional platforms for social media
- Real-time analytics updates

---

## Testing Checklist

### Publish Pipeline Consistency

- [ ] Portfolio: Create project via `portfolio:create`
- [ ] Portfolio: Publish via `publish-pipeline:publish entityType=project`
- [ ] Portfolio: Status changes to "published", publishedAt set
- [ ] Newsletter: Create newsletter via `newsletter:create`
- [ ] Newsletter: Publish via `publish-pipeline:publish entityType=newsletter`
- [ ] Newsletter: Sent via Buttondown

### Social Auto-Generation

- [ ] Publish a blog post
- [ ] LinkedIn post auto-created
- [ ] Post appears in social-post entity list

### Analytics Dashboard

- [ ] Dashboard page renders at route
- [ ] Shows website metrics
- [ ] Shows social metrics (if LinkedIn configured)
