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

### Issue 1: Inconsistent Tool Name Separator (Bug)

**File:** `shell/plugins/src/base-plugin.ts:300`

```typescript
// BasePlugin.createTool() uses colon:
name: `${this.id}:${name}`,

// But ALL actual plugins use underscore:
name: `${pluginId}_capture`,  // link, blog, etc.
```

**Impact:** The `createTool()` helper is unusable.
**Fix:** Change to `${this.id}_${name}`

---

### Issue 2: Unused Lifecycle Hooks

**File:** `shell/plugins/src/service/service-plugin.ts:106-121`

```typescript
// These hooks exist but nobody uses them:
protected async registerEntityTypes(_context): Promise<void> {}
protected async registerJobHandlers(_context): Promise<void> {}
```

**Problem:** Plugins override `onRegister()` directly instead.
**Fix:** Remove hooks OR make them the primary pattern.

---

### Issue 3: CorePluginContext Has Write Operations

**File:** `shell/plugins/src/core/context.ts:72-83`

```typescript
// Called "read-only" but includes:
startConversation: (...) => Promise<string>;  // WRITE
addMessage: (...) => Promise<void>;           // WRITE
```

**Fix:** Move to InterfacePluginContext (interfaces manage conversations).

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

### Gap 1: README is Outdated

**File:** `shell/plugins/README.md`

- Tool names use `:` (should be `_`)
- Context interfaces don't match actual code
- Missing `ServicePlugin` from exports list
- Test harness function names wrong

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

| Priority | Issue                               | Effort | Impact          |
| -------- | ----------------------------------- | ------ | --------------- |
| **P0**   | Fix tool name separator (#1)        | 15 min | Bug fix         |
| **P1**   | Fix README                          | 2 hrs  | OSS blocker     |
| **P1**   | Remove unused hooks (#2)            | 30 min | API cleanup     |
| **P1**   | Move conversation writes (#3)       | 1 hr   | API correctness |
| **P2**   | Make progress handler optional (#6) | 30 min | DX improvement  |
| **P2**   | Add job tracking cleanup (#7)       | 1 hr   | Memory safety   |
| **P2**   | Create quick-start guide            | 2 hrs  | OSS enabler     |
| **P3**   | Fix naming conventions (#8)         | 2 hrs  | API polish      |
| **P3**   | Fix parameter types (#5)            | 1 hr   | Readability     |
| **P3**   | Namespace context methods (#4)      | 4 hrs  | Breaking change |

---

## Files to Modify

| File                                              | Changes                              |
| ------------------------------------------------- | ------------------------------------ |
| `shell/plugins/src/base-plugin.ts`                | Fix tool/resource name separator     |
| `shell/plugins/src/service/service-plugin.ts`     | Remove unused hooks, fix param types |
| `shell/plugins/src/interface/interface-plugin.ts` | Optional progress handler, cleanup   |
| `shell/plugins/src/core/context.ts`               | Move conversation writes             |
| `shell/plugins/README.md`                         | Complete rewrite                     |
| `docs/plugin-quickstart.md`                       | New file                             |

---

## Questions

1. Should we fix all P0-P1 issues now, or prioritize differently?
2. For context size (#4): Keep flat with docs, or namespace (breaking change)?
3. For unused hooks (#2): Remove entirely, or document as optional pattern?
