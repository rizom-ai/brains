# Test Coverage Improvement Plan

## Status: Ready for Implementation

## Problem

Several plugins have 0% or low test coverage:

| Plugin            | Coverage         | Priority |
| ----------------- | ---------------- | -------- |
| system            | 0% (0/5 files)   | Critical |
| professional-site | 0% (0/8 files)   | Critical |
| portfolio         | 44% (4/9 files)  | High     |
| link              | 31% (5/16 files) | Medium   |
| note              | 38% (3/8 files)  | Medium   |

## Files to Create

### system plugin (`plugins/system/test/`)

- `plugin.test.ts` - Plugin registration and lifecycle
- `tools.test.ts` - Tool execution and validation

### professional-site plugin (`plugins/professional-site/test/`)

- `plugin.test.ts` - Plugin registration
- `datasources.test.ts` - Homepage and about datasources
- `schemas.test.ts` - Professional profile schema validation

### portfolio plugin (`plugins/portfolio/test/`)

- `plugin.test.ts` - Plugin registration (missing)

## Implementation Pattern

Use existing test harnesses from `@brains/plugins/test`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { SystemPlugin } from "../src";

describe("SystemPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(async () => {
    harness = createServicePluginHarness({ dataDir: "/tmp/test" });
    await harness.installPlugin(new SystemPlugin());
  });

  it("should register tools", async () => {
    const capabilities = harness.getCapabilities();
    expect(capabilities.tools.length).toBeGreaterThan(0);
  });

  it("should handle tool execution", async () => {
    const result = await harness.executeTool("system_tool-name", {});
    expect(result.success).toBe(true);
  });
});
```

## Test Guidelines

From project CLAUDE.md:

- Focus exclusively on unit tests
- Test behavior, not implementation details
- Always mock dependencies
- Keep tests minimal but effective
- Use test harnesses, never access private members

## Verification Commands

```bash
# Run all plugin tests
bun test plugins/

# Run specific plugin tests
bun test plugins/system
bun test plugins/professional-site
bun test plugins/portfolio

# Check coverage (if configured)
bun test --coverage plugins/system plugins/professional-site plugins/portfolio
```

## Execution Order

1. system plugin (critical - 0% coverage)
2. professional-site plugin (critical - 0% coverage)
3. portfolio plugin (high - missing plugin.test.ts)
4. link plugin (medium - incremental)
5. note plugin (medium - incremental)
