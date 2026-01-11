# @brains/plugins - Open Source Readiness Evaluation

## Goal

Evaluate `@brains/plugins` from an open source contributor's perspective. Identify what's clean/mature and what needs improvement before public release.

---

## Executive Summary

The `@brains/plugins` package has **good foundations** but has **code-level inconsistencies** and **API design issues** that should be addressed before OSS release. The architecture is sound but the implementation has rough edges.

**8 code issues found** | **3 documentation gaps** | **Estimated effort: 2-3 days**

---

## Strengths (Keep As-Is)

| Area             | Assessment                                                             |
| ---------------- | ---------------------------------------------------------------------- |
| Plugin Hierarchy | Good - Clear progression: CorePlugin → ServicePlugin → InterfacePlugin |
| Type Safety      | Good - Strongly-typed contexts, generics for tracking info             |
| JSDoc            | Excellent - Most methods documented                                    |
| Re-exports       | Excellent - Dependencies consolidated in index.ts                      |
| Test Utilities   | Good - MockShell and harnesses available                               |

---

## Code Issues

### Issue 1: createTool/createResource Helpers Unusable ✅ RESOLVED

**File:** `shell/plugins/src/utils/tool-helpers.ts` (NEW)

**Solution:** Created standalone utility functions exported from `@brains/plugins`:

```typescript
import { createTool, createResource } from "@brains/plugins";

// Now usable in any factory function:
export function createLinkTools(pluginId, context) {
  return [createTool(pluginId, "capture", "...", inputSchema, handler)];
}
```

All 29 tools migrated to use the new `createTool` helper.

---

### Issue 2: Lifecycle Hooks - KEEP

**File:** `shell/plugins/src/service/service-plugin.ts:106-121`

```typescript
protected async registerEntityTypes(_context): Promise<void> {}
protected async registerJobHandlers(_context): Promise<void> {}
```

**Finding:** `directory-sync` plugin uses `registerJobHandlers`. Hooks ARE used.
**Decision:** Keep hooks as-is. Document as optional pattern for complex plugins.

---

### Issue 3: CorePluginContext Has Write Operations ✅ RESOLVED

**File:** `shell/plugins/src/core/context.ts` and `shell/plugins/src/interface/context.ts`

**Solution:** Moved `startConversation` and `addMessage` from CorePluginContext to InterfacePluginContext.

- CorePluginContext now only has read-only conversation methods (`getConversation`, `searchConversations`, `getMessages`)
- InterfacePluginContext (for interface plugins) now has the write operations since interfaces manage conversations

---

### Issue 4: ServicePluginContext Too Large (30+ Methods)

**File:** `shell/plugins/src/service/context.ts`

Methods span: entities, jobs, AI, templates, conversations, views, content resolution.

**Options:**

- A) Keep flat, add JSDoc section headers
- B) Namespace: `context.entities.register()`, `context.jobs.enqueue()`

---

### Issue 5: Cryptic Parameter Types

**File:** `shell/plugins/src/service/service-plugin.ts:85-97`

```typescript
toolContext: Parameters<ServicePluginContext["enqueueJob"]>[2],  // ???
```

**Fix:** Export explicit type aliases.

---

### Issue 6: InterfacePlugin Forces Abstract Progress Handler

**File:** `shell/plugins/src/interface/interface-plugin.ts:107`

```typescript
protected abstract handleProgressEvent(...): Promise<void>;
```

**Fix:** Make optional with default no-op.

---

### Issue 7: No Job Tracking Cleanup

**File:** `shell/plugins/src/interface/interface-plugin.ts:37`

```typescript
protected jobMessages = new Map<string, TTrackingInfo>();
```

**Problem:** No cleanup mechanism. Memory leak risk.
**Fix:** Add TTL-based cleanup or job completion hooks.

---

### Issue 8: Mixed Naming Conventions

```typescript
entityService: IEntityService;     // property
getAdapter(type): EntityAdapter;   // get* method
registerEntityType(...): void;     // verb method
formatContent(...): string;        // verb method (should be get?)
```

**Fix:** Standardize: properties for access, `get*` for computed, verbs for mutations.

---

## Documentation Gaps

### Gap 1: README is Outdated ✅ RESOLVED

**File:** `shell/plugins/README.md`

**Solution:** Complete rewrite with:

- Correct tool naming (`_` separator)
- `createTool` helper examples (new recommended pattern)
- Accurate context interfaces
- Correct test harness function names
- All plugin types documented

---

### Gap 2: No Quick-Start Guide

- No "Hello World" example
- No scaffolding/template
- Contributors reverse-engineer from existing plugins

---

### Gap 3: Documentation Scattered

- `docs/plugin-system.md`
- `docs/plugin-development-patterns.md`
- `CLAUDE-PLUGINS-INTERFACES.md`
- `plugins/examples/`

No single entry point.

---

## Recommended Priority

| Priority | Issue                                 | Effort | Impact          |
| -------- | ------------------------------------- | ------ | --------------- |
| **P1**   | Convert createTool to standalone (#1) | 1 hr   | API usability   |
| **P1**   | Fix README                            | 2 hrs  | OSS blocker     |
| **P1**   | Move conversation writes (#3)         | 1 hr   | API correctness |
| **P2**   | Make progress handler optional (#6)   | 30 min | DX improvement  |
| **P2**   | Add job tracking cleanup (#7)         | 1 hr   | Memory safety   |
| **P2**   | Create quick-start guide              | 2 hrs  | OSS enabler     |
| **P3**   | Fix naming conventions (#8)           | 2 hrs  | API polish      |
| **P3**   | Fix parameter types (#5)              | 1 hr   | Readability     |
| **P3**   | Namespace context methods (#4)        | 4 hrs  | Breaking change |

---

## Files to Modify

| File                                              | Changes                                   |
| ------------------------------------------------- | ----------------------------------------- |
| `shell/plugins/src/base-plugin.ts`                | Remove class method helpers               |
| `shell/plugins/src/utils/tool-helpers.ts`         | New: standalone createTool/createResource |
| `shell/plugins/src/index.ts`                      | Export new utilities                      |
| `shell/plugins/src/service/service-plugin.ts`     | Fix param types                           |
| `shell/plugins/src/interface/interface-plugin.ts` | Optional progress handler, cleanup        |
| `shell/plugins/src/core/context.ts`               | Move conversation writes                  |
| `shell/plugins/README.md`                         | Complete rewrite                          |
| `docs/plugin-quickstart.md`                       | New file                                  |

---

## Questions

1. Should we fix all P0-P1 issues now, or prioritize differently?
2. For context size (#4): Keep flat with docs, or namespace (breaking change)?
3. For unused hooks (#2): Remove entirely, or document as optional pattern?
