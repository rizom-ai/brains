# AI Evaluation Package Refactor

## Overview

Rename `agent-evaluation` to `ai-evaluation` and extend it to support both agent-based (chat) and plugin-based (direct) evaluations in a unified framework.

## Current State

The `shell/agent-evaluation` package:

- Tests agent responses via `AgentService.chat()`
- Supports test types: `tool_invocation`, `response_quality`, `multi_turn`
- Runs against a brain instance (local or remote)
- Uses YAML test cases in `apps/{brain}/test-cases/`

## Goals

1. Rename package to `ai-evaluation` (more general purpose)
2. Add support for plugin-level evaluations
3. Unified CLI for running all eval types
4. Plugins can register eval handlers
5. Test cases can live in plugins or apps

## Architecture

### Eval Types

| Type               | Description                 | Runner              |
| ------------------ | --------------------------- | ------------------- |
| `tool_invocation`  | Agent uses correct tools    | AgentService.chat() |
| `response_quality` | Agent response quality      | AgentService.chat() |
| `multi_turn`       | Multi-turn conversations    | AgentService.chat() |
| `plugin`           | Direct plugin functionality | Plugin eval handler |

### Package Structure

```
shell/ai-evaluation/
├── src/
│   ├── index.ts
│   ├── types.ts                    # Shared types + EvalHandler interface
│   ├── schemas/
│   │   ├── test-case.ts            # Base test case schema
│   │   ├── agent-test-case.ts      # Agent-specific schema
│   │   └── plugin-test-case.ts     # Plugin-specific schema
│   ├── runners/
│   │   ├── base-runner.ts          # Abstract base class
│   │   ├── agent-runner.ts         # Runs agent evals (existing logic)
│   │   └── plugin-runner.ts        # Runs plugin evals
│   ├── validators/
│   │   ├── response-validator.ts   # Existing response validation
│   │   └── output-validator.ts     # Generic output validation
│   ├── eval-handler-registry.ts    # Plugins register handlers here
│   ├── evaluation-service.ts       # Orchestrates everything
│   ├── test-case-loader.ts         # Loads from apps + plugins
│   ├── metric-collector.ts         # Existing
│   ├── llm-judge.ts                # Existing
│   └── run-evaluations.ts          # CLI entry point
└── package.json
```

## Changes Required

### 1. Rename Package

- Rename `shell/agent-evaluation` → `shell/ai-evaluation`
- Update all imports and references
- Update `package.json` name to `@brains/ai-evaluation`

### 2. Add EvalHandler Interface

```typescript
// src/types.ts

export interface EvalHandler<TInput = unknown, TOutput = unknown> {
  (input: TInput): Promise<TOutput>;
}

export interface EvalHandlerRegistry {
  register(pluginId: string, handlerId: string, handler: EvalHandler): void;
  get(pluginId: string, handlerId: string): EvalHandler | undefined;
  list(): Array<{ pluginId: string; handlerId: string }>;
}
```

### 3. Extend Test Case Schema

```typescript
// src/schemas/test-case.ts

export const baseTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Agent test cases (existing)
export const agentTestCaseSchema = baseTestCaseSchema.extend({
  type: z.enum(["tool_invocation", "response_quality", "multi_turn"]),
  turns: z.array(turnSchema),
  successCriteria: successCriteriaSchema,
  efficiency: efficiencySchema.optional(),
});

// Plugin test cases (new)
export const pluginTestCaseSchema = baseTestCaseSchema.extend({
  type: z.literal("plugin"),
  plugin: z.string(), // Plugin ID
  handler: z.string(), // Handler ID within plugin
  input: z.record(z.unknown()), // Input to pass to handler
  expectedOutput: expectedOutputSchema,
});

export const testCaseSchema = z.discriminatedUnion("type", [
  agentTestCaseSchema,
  pluginTestCaseSchema,
]);
```

### 4. Add Plugin Runner

```typescript
// src/runners/plugin-runner.ts

export class PluginRunner {
  constructor(
    private registry: EvalHandlerRegistry,
    private logger: Logger,
  ) {}

  async run(testCase: PluginTestCase): Promise<EvalResult> {
    const handler = this.registry.get(testCase.plugin, testCase.handler);
    if (!handler) {
      return {
        passed: false,
        error: `Handler not found: ${testCase.plugin}:${testCase.handler}`,
      };
    }

    const startTime = Date.now();
    const output = await handler(testCase.input);
    const duration = Date.now() - startTime;

    const validation = this.validateOutput(output, testCase.expectedOutput);

    return {
      passed: validation.passed,
      output,
      validation,
      metrics: { duration },
    };
  }
}
```

### 5. Add Output Validator

```typescript
// src/validators/output-validator.ts

export const expectedOutputSchema = z.object({
  // Count validation
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  exactItems: z.number().optional(),

  // Content validation
  itemsContain: z
    .array(
      z.object({
        field: z.string(),
        pattern: z.string(), // Regex pattern
      }),
    )
    .optional(),

  // Structure validation
  validateEach: z
    .array(
      z.object({
        path: z.string(), // JSONPath-like: "sources[0].type"
        equals: z.unknown().optional(),
        matches: z.string().optional(), // Regex
        exists: z.boolean().optional(),
      }),
    )
    .optional(),

  // Custom validation (for complex cases)
  customValidator: z.string().optional(), // Function name to call
});

export function validateOutput(
  output: unknown,
  expected: ExpectedOutput,
): ValidationResult {
  const failures: string[] = [];

  // Array length validation
  if (Array.isArray(output)) {
    if (expected.minItems && output.length < expected.minItems) {
      failures.push(
        `Expected at least ${expected.minItems} items, got ${output.length}`,
      );
    }
    if (expected.maxItems && output.length > expected.maxItems) {
      failures.push(
        `Expected at most ${expected.maxItems} items, got ${output.length}`,
      );
    }
  }

  // Field pattern matching
  if (expected.itemsContain) {
    for (const check of expected.itemsContain) {
      const found = findMatchingItem(output, check.field, check.pattern);
      if (!found) {
        failures.push(
          `No item with ${check.field} matching "${check.pattern}"`,
        );
      }
    }
  }

  // Path validation
  if (expected.validateEach) {
    for (const check of expected.validateEach) {
      const value = getValueAtPath(output, check.path);
      if (check.equals !== undefined && value !== check.equals) {
        failures.push(`${check.path}: expected ${check.equals}, got ${value}`);
      }
      if (check.matches && !new RegExp(check.matches).test(String(value))) {
        failures.push(
          `${check.path}: "${value}" doesn't match "${check.matches}"`,
        );
      }
      if (check.exists === true && value === undefined) {
        failures.push(`${check.path}: expected to exist`);
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
```

### 6. Extend ServicePluginContext

```typescript
// In @brains/plugins

export interface ServicePluginContext {
  // ... existing methods

  /**
   * Register an eval handler for plugin-level testing
   */
  registerEvalHandler(handlerId: string, handler: EvalHandler): void;
}
```

### 7. Update Test Case Loader

```typescript
// src/test-case-loader.ts

export async function loadTestCases(options: {
  appTestCasesDir?: string; // apps/{brain}/test-cases/
  pluginDirs?: string[]; // plugins/*/evals/
  tags?: string[];
  testIds?: string[];
  plugin?: string; // Filter by plugin
}): Promise<TestCase[]> {
  const cases: TestCase[] = [];

  // Load from app
  if (options.appTestCasesDir) {
    cases.push(...(await loadFromDirectory(options.appTestCasesDir)));
  }

  // Load from plugins
  if (options.pluginDirs) {
    for (const dir of options.pluginDirs) {
      cases.push(...(await loadFromDirectory(dir)));
    }
  }

  // Apply filters
  return cases
    .filter(
      (c) => !options.tags || options.tags.some((t) => c.tags?.includes(t)),
    )
    .filter((c) => !options.testIds || options.testIds.includes(c.id))
    .filter(
      (c) =>
        !options.plugin || (c.type === "plugin" && c.plugin === options.plugin),
    );
}
```

### 8. Update CLI

```typescript
// src/run-evaluations.ts

// New flags:
// --plugin <id>    Run only evals for a specific plugin
// --type <type>    Run only evals of a specific type

function printHelp(): void {
  console.log(`
Usage: bun run eval [options]

Options:
  --tags <tags>       Run tests with specific tags (comma-separated)
  --test <ids>        Run specific test(s) by ID (comma-separated)
  --plugin <id>       Run only plugin evals for specified plugin
  --type <type>       Run only evals of specified type (agent, plugin)
  --url <url>         Run against remote instance
  --token <token>     Auth token for remote instance
  --skip-llm-judge    Skip LLM judge scoring
  --verbose           Show detailed output
  --help              Show this help
  `);
}
```

## Implementation Order

1. Rename package (`agent-evaluation` → `ai-evaluation`)
2. Update all imports/references
3. Add `EvalHandlerRegistry`
4. Add `pluginTestCaseSchema`
5. Add `OutputValidator`
6. Add `PluginRunner`
7. Extend `ServicePluginContext` with `registerEvalHandler`
8. Update `TestCaseLoader` to load from plugins
9. Update CLI with new flags
10. Update `EvaluationService` to use both runners
11. Add tests
12. Run typecheck

## Example Plugin Integration

### Plugin Registration

```typescript
// plugins/topics/src/index.ts

override async onRegister(context: ServicePluginContext): Promise<void> {
  // ... existing registration

  // Register eval handlers
  context.registerEvalHandler("extractFromEntity", async (input) => {
    const extractor = new TopicExtractor(context, this.logger);
    const entity = this.createMockEntity(input);
    return extractor.extractFromEntity(entity, input.minRelevanceScore ?? 0.5);
  });
}
```

### Plugin Eval Test Case

```yaml
# plugins/topics/evals/blog-post-extraction.yaml
id: topics-blog-post-extraction
name: Extract topics from blog post
type: plugin
plugin: topics
handler: extractFromEntity
tags:
  - topics
  - extraction

input:
  entityType: post
  content: |
    # Introduction to Machine Learning
    Machine learning is a subset of AI...
  metadata:
    title: "Introduction to Machine Learning"
  minRelevanceScore: 0.5

expectedOutput:
  minItems: 1
  maxItems: 5
  itemsContain:
    - field: title
      pattern: "machine learning|deep learning|AI"
  validateEach:
    - path: "[0].sources[0].type"
      equals: "post"
```

### Running Evals

```bash
# Run all evals
cd apps/professional-brain && bun run eval

# Run only plugin evals
bun run eval --type plugin

# Run only topics plugin evals
bun run eval --plugin topics

# Run specific test
bun run eval --test topics-blog-post-extraction
```

## Migration Notes

### For Existing Agent Evals

No changes required. Existing test cases with `type: tool_invocation`, `response_quality`, or `multi_turn` continue to work as before.

### For New Plugin Evals

1. Create `evals/` directory in plugin
2. Add YAML test cases with `type: plugin`
3. Register eval handlers in plugin's `onRegister()`
4. Run with `bun run eval --plugin <id>`

## Dependencies

- No new external dependencies
- Uses existing Zod for schema validation
- Uses existing YAML parsing

## Success Criteria

- [ ] Package renamed to `ai-evaluation`
- [ ] Existing agent evals continue to work
- [ ] Plugins can register eval handlers
- [ ] Plugin test cases can be defined in YAML
- [ ] CLI supports `--plugin` and `--type` flags
- [ ] Output validator handles common validation patterns
- [ ] Topics plugin evals work as proof of concept
