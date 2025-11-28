# Plan: Extract Profile Service into Plugin

## Overview

Move `shell/profile-service/` to `plugins/profile/` to better reflect that profile is an optional presentation layer, not a core brain capability.

## Rationale

- **Identity (core)**: Defines what the brain _is_ - role, purpose, values. Shapes behavior.
- **Profile (plugin)**: Defines how the brain _presents itself_ - name, tagline, bio, social links. Only needed for public-facing sites.

## Current State

Profile service lives in `shell/profile-service/` and is consumed by:

- `plugins/site-builder` - for site info (title, social links)
- `plugins/professional-site` - for homepage hero (tagline, intro)
- `plugins/blog` - for blog generation (author info)

## Steps

### 1. Create plugin structure

- [ ] Create `plugins/profile/` directory
- [ ] Move source files from `shell/profile-service/src/` to `plugins/profile/src/`
- [ ] Move test files from `shell/profile-service/test/` to `plugins/profile/test/`
- [ ] Update `package.json` name from `@brains/profile-service` to `@brains/profile`

### 2. Convert to plugin architecture

- [ ] Create `plugins/profile/src/plugin.ts` with plugin definition
- [ ] Register profile entity type
- [ ] Expose ProfileService via plugin API
- [ ] Export types and schemas from plugin index

### 3. Update consumers

- [ ] `plugins/site-builder/package.json` - update dependency
- [ ] `plugins/professional-site/package.json` - update dependency
- [ ] `plugins/blog/package.json` - update dependency
- [ ] Update all imports from `@brains/profile-service` to `@brains/profile`

### 4. Update shell

- [ ] Remove `shell/profile-service/` from shell workspace
- [ ] Remove profile-service initialization from shell startup (if any)
- [ ] Add `@brains/profile` to plugin dependencies where needed

### 5. Update configuration

- [ ] Update `turbo.json` if profile-service is referenced
- [ ] Update root `package.json` workspace paths
- [ ] Update any tsconfig references

### 6. Cleanup

- [ ] Delete `shell/profile-service/` directory
- [ ] Update `docs/architecture-overview.md`
- [ ] Update `README.md` references

### 7. Verify

- [ ] Run `bun run typecheck`
- [ ] Run `bun run test`
- [ ] Run `bun run lint`
- [ ] Build and test professional-brain site

## Decisions

1. **Auto-register**: Yes - profile plugin automatically registers "profile" entity type on load
2. **Soft dependency**: Site-builder uses fallback/default values if profile plugin is missing (no hard failure)
3. **No migration needed**: Profile.md format stays the same, just moving the service code

## Estimated Complexity

Low-medium. The profile-service is already self-contained with minimal shell integration. Main work is updating imports and package references.
