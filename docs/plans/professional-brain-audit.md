# Professional Brain Audit - December 2025

## Summary

Audit of professional brain and its dependencies to identify urgent improvements.

**False positive from initial scan:** .env files are NOT in git (correctly gitignored).

---

## HIGH PRIORITY

### 1. Security: Update @modelcontextprotocol/sdk

**Current:** `^1.12.0` | **Required:** `>=1.24.0` | **Latest:** `1.25.1`

- Vulnerability: No DNS rebinding protection (GHSA-w48q-cv73-mx4w)
- Files: `shell/mcp-service/package.json`, `interfaces/mcp/package.json`
- Risk: Major version jump (1.12→1.25) may have breaking changes - test after update

### 2. Security: matrix-bot-sdk form-data vulnerability

**Current:** `^0.7.1` (latest) | **Status:** No fix available upstream

- Transitive dep `form-data <2.5.4` has unsafe random boundary (CRITICAL)
- matrix-bot-sdk hasn't updated yet - monitor for updates
- **Action:** Document as known risk, no immediate fix possible

### 3. ESLint Warnings (6 total)

**Link plugin - capture-handler.ts:**

```typescript
// Lines 196, 214, 255 - remove unnecessary ?? (types already non-nullable)
extractedData.title ?? new URL(url).hostname; // → extractedData.title || new URL(url).hostname
extractedData.keywords ?? []; // → extractedData.keywords
```

**Link plugin - datasource.test.ts:20:**

```typescript
// Add return type
function createMock() { ... }  // → function createMock(): MockType { ... }
```

**Portfolio plugin - tools/index.ts:74:**

```typescript
// Remove unnecessary ?. and use ?? instead of ||
entity.metadata?.["title"] || entity.id; // → entity.metadata["title"] ?? entity.id
```

---

## MEDIUM PRIORITY

### 4. Dead Code

**File:** `plugins/professional-site/src/components/CompactFooter.tsx`

- Component defined but never imported/used
- Layout uses `Footer` from `@brains/default-site-content` instead

**Action:** Delete CompactFooter.tsx

### 5. Test Coverage Gaps

**professional-site plugin:**

- Only 1 test file: `test/homepage-datasource.test.ts`
- No tests for: CompactHeader, WavyDivider, ProfessionalLayout, templates

**Action:** Add tests for critical components (at minimum datasources).

---

## LOW PRIORITY

### 6. Moderate Security Vulnerabilities

- esbuild, tar, body-parser, tough-cookie, request, vite, hono
- Most are dev dependencies or have limited attack surface

**Action:** Monitor for updates, address in regular dependency maintenance.

---

## Execution Order

### Step 1: Fix ESLint warnings (quick win)

```bash
# After fixes, verify:
bun run lint  # Should show 0 warnings
```

### Step 2: Delete dead code

```bash
rm plugins/professional-site/src/components/CompactFooter.tsx
# Verify no imports break
bun run typecheck
```

### Step 3: Update MCP SDK

```bash
# In shell/mcp-service and interfaces/mcp:
# Change: "@modelcontextprotocol/sdk": "^1.12.0" → "^1.24.0"
bun install
bun run typecheck
bun test
```

### Step 4: Verify & commit

```bash
bun run lint && bun run typecheck && bun test
```

---

## Files to Modify

| File                                                         | Change                     |
| ------------------------------------------------------------ | -------------------------- |
| `plugins/link/src/handlers/capture-handler.ts`               | 3 ESLint fixes             |
| `plugins/link/test/datasource.test.ts`                       | 1 ESLint fix (return type) |
| `plugins/portfolio/src/tools/index.ts`                       | 2 ESLint fixes             |
| `plugins/professional-site/src/components/CompactFooter.tsx` | DELETE                     |
| `shell/mcp-service/package.json`                             | Update MCP SDK             |
| `interfaces/mcp/package.json`                                | Update MCP SDK             |
