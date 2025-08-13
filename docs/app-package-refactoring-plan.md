# App Package & Configuration Refactoring Plan

## Overview
This document outlines the comprehensive refactoring of the app package and configuration management across the Brain project. The goal is to simplify configuration, reduce environment variable sprawl, and create a cleaner architecture.

## Configuration Philosophy

### Three-Tier Configuration Hierarchy

1. **Environment Variables**: ONLY for secrets
   - API keys (ANTHROPIC_API_KEY, MATRIX_ACCESS_TOKEN)
   - Authentication tokens
   - Nothing else

2. **Config File (brain.config.yaml)**: For deployment-specific settings
   - Server ports
   - Service URLs
   - User identities
   - Model selection

3. **Hardcoded Defaults**: For everything else
   - Database paths (./data/*.db)
   - Cache directories
   - Timeouts and intervals
   - Feature flags

## Current Issues

1. **Mixed Responsibilities**: App class handles CLI parsing, interface registration, signal handling
2. **Interface Confusion**: Interfaces configured separately but registered as plugins
3. **Environment Variable Sprawl**: 30+ env vars across packages
4. **Complex Configuration**: Multiple config merging layers
5. **Missing Documentation**: No clear guidance on configuration

## Implementation Plan

### Phase 1: Config Infrastructure

#### 1.1 Create Config Loader
Create `shell/app/src/config-loader.ts`:
- Load brain.config.yaml using @brains/utils
- Merge with hardcoded defaults
- Validate required secrets from env
- Export typed configuration

#### 1.2 Create Example Config
Create `apps/test-brain/brain.config.example.yaml`:
```yaml
# Brain application configuration
# Copy to brain.config.yaml and customize

# Matrix bot configuration (optional)
# Requires MATRIX_ACCESS_TOKEN environment variable
matrix:
  homeserver: https://matrix.org
  userId: "@bot:matrix.org"
  anchorUserId: "@admin:matrix.org"
  trustedUsers:
    - "@user1:matrix.org"
    - "@user2:matrix.org"

# File synchronization (optional)
sync:
  path: ./brain-data

# Server ports (optional, defaults shown)
servers:
  mcpPort: 3333
  websitePreviewPort: 4321
  websiteProductionPort: 8080

# AI configuration (optional)
# Requires ANTHROPIC_API_KEY environment variable
ai:
  model: claude-3-haiku-20240307
```

### Phase 2: Simplify App Package

#### 2.1 Refactor app.ts
- Remove interfaces array completely
- All interfaces become regular plugins
- Keep --cli flag for development convenience
- Use config-loader for all configuration
- Simplify initialization flow

#### 2.2 Update types.ts
- Remove InterfaceConfig and interfaceConfigSchema
- Simplify AppConfig to essential fields
- Add brain.config.yaml types

### Phase 3: Update Test-Brain

#### 3.1 Simplify index.ts
Before: 125 lines with complex env var checking
After: ~40 lines with clean plugin registration

```typescript
import { App } from "@brains/app";
// ... plugin imports

await App.run({
  name: "test-brain",
  version: "1.0.0",
  // Config loaded from brain.config.yaml
  // Secrets from env vars
  // Everything else uses defaults
});
```

### Phase 4: Clean Environment Variables

#### 4.1 Environment Variable Audit

**Keep as ENV (6 total):**
- ANTHROPIC_API_KEY
- MATRIX_ACCESS_TOKEN
- MATRIX_ADMIN_TOKEN (setup only)
- DATABASE_AUTH_TOKEN (optional)
- JOB_QUEUE_DATABASE_AUTH_TOKEN (optional)
- CONVERSATION_DATABASE_AUTH_TOKEN (optional)

**Move to Config File (11 vars):**
- MATRIX_HOMESERVER
- MATRIX_USER_ID
- MATRIX_ANCHOR_USER_ID
- MATRIX_TRUSTED_USERS
- SYNC_PATH
- BRAIN_SERVER_PORT
- WEBSITE_PREVIEW_PORT
- WEBSITE_PRODUCTION_PORT
- AI_MODEL

**Remove/Hardcode (15+ vars):**
- All DATABASE_URL vars → ./data/*.db
- FASTEMBED_CACHE_DIR → ./cache/embeddings
- LOG_LEVEL → info
- MCP_TRANSPORT → http
- WATCH_ENABLED → false
- WATCH_INTERVAL → 5000
- MATRIX_DISPLAY_NAME → Personal Brain
- All WEBSITE_*_DIR vars → ./dist/*

#### 4.2 Update Package Configurations

**shell/core/src/config/shellConfig.ts:**
- Remove all env var fallbacks except secrets
- Use hardcoded defaults

**Database packages:**
- entity-service: ./data/brain.db
- job-queue: ./data/brain-jobs.db
- conversation-service: ./data/conversations.db

**Other services:**
- embedding-service: ./cache/embeddings
- matrix: Hardcode display name

### Phase 5: Documentation & Testing

#### 5.1 Create README.md
Comprehensive documentation for app package:
- Configuration hierarchy
- Usage examples
- Migration guide

#### 5.2 Update Tests
- Fix app.test.ts
- Update integration tests
- Remove env var mocking

### Expected Benefits

1. **Simpler Configuration**: Clear 3-tier hierarchy
2. **Reduced Complexity**: 75% fewer environment variables
3. **Better Developer Experience**: One config file to edit
4. **Cleaner Architecture**: Consistent plugin handling
5. **Easier Testing**: Predictable defaults
6. **Better Documentation**: Self-documenting config file

### Migration Guide

For existing users:
1. Copy brain.config.example.yaml to brain.config.yaml
2. Move non-secret env vars to config file
3. Keep only API keys in environment
4. Delete old env var exports from shell scripts

### Implementation Order

1. Create config infrastructure (config-loader.ts)
2. Create example config file
3. Update app.ts and types.ts
4. Update test-brain/index.ts
5. Clean env vars from all packages
6. Update tests
7. Create documentation
8. Test complete system

## Success Criteria

- [ ] Only 6 environment variables remain (secrets only)
- [ ] Test-brain index.ts under 50 lines
- [ ] All tests pass without env var mocking
- [ ] Config file documents all options
- [ ] Interfaces treated as regular plugins

## Notes

This refactoring is part of the broader architecture cleanup outlined in the roadmap (section 1.4 - App Package Refactoring). It addresses technical debt while maintaining backward compatibility through the config file approach.