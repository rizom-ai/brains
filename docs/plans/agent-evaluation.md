# Agent Evaluation System

## Overview

Create a test suite system to evaluate agent performance across three dimensions:

1. **Task completion** - Did expected tools get called? Did entities get created?
2. **Efficiency metrics** - Token usage, tool calls, response time
3. **Quality scoring** - LLM-as-judge evaluation of helpfulness, accuracy, instruction-following

## Architecture

New package: `shell/agent-evaluation/`

```
shell/agent-evaluation/
  src/
    index.ts
    types.ts
    schemas/
      test-case.ts          # Zod schemas for test case definitions
      evaluation-result.ts  # Zod schemas for results
    evaluation-service.ts   # Main orchestration
    test-runner.ts          # Executes test cases against agent
    metric-collector.ts     # Extracts metrics from AgentResponse
    llm-judge.ts           # LLM-as-judge quality scoring
    loaders/
      yaml-loader.ts        # Loads test cases from YAML files
    reporters/
      console-reporter.ts   # CLI output
      json-reporter.ts      # JSON export for persistence
  test/
    evaluation-service.test.ts
    test-runner.test.ts
  package.json
```

Test cases stored in: `data/evaluations/test-cases/` as YAML files

## Implementation Plan

**Recommended order**: Phases 1-3 first (core + LLM judge + reporting), then Phase 4-5 later.

### Phase 1: Core Infrastructure

1. **Create package structure**
   - `shell/agent-evaluation/package.json` with dependencies on `@brains/agent-service`, `@brains/ai-service`, `@brains/utils`
   - Export types and service from `index.ts`

2. **Define schemas** (`src/schemas/`)
   - `test-case.ts`: TestCase schema with fields:
     - `id`, `name`, `description`, `type` (tool_invocation | response_quality | multi_turn)
     - `tags` for filtering
     - `setup.permissionLevel` (anchor/trusted/public)
     - `turns[]` with `userMessage` and optional per-turn `successCriteria`
     - `successCriteria`: expectedTools, responseContains, responseNotContains, toolCountRange
     - `efficiency`: maxTokens, maxToolCalls, maxDurationMs
   - `evaluation-result.ts`: EvaluationResult schema with:
     - `passed`, `testCaseId`, `timestamp`
     - `turnResults[]` with metrics and tool calls per turn
     - `totalMetrics`: tokens, toolCalls, duration
     - `qualityScores`: helpfulness, accuracy, instructionFollowing (0-5)
     - `failures[]` with criterion, expected, actual

3. **Metric collector** (`src/metric-collector.ts`)
   - Extract from `AgentResponse.usage` (tokens) and `AgentResponse.toolResults`
   - Track duration via timestamps
   - Aggregate across multiple turns

4. **Test runner** (`src/test-runner.ts`)
   - Accept `IAgentService` for isolation
   - Execute conversation turns via `agentService.chat()`
   - Evaluate success criteria after each turn and at end
   - Return `EvaluationResult`

### Phase 2: LLM-as-Judge

5. **LLM judge** (`src/llm-judge.ts`)
   - Use `IAIService.generateObject()` to score responses
   - Evaluate: helpfulness, accuracy, instructionFollowing, appropriateToolUse (0-5 scale)
   - Include `sampleRate` option for cost optimization (skip some evaluations)
   - Return `QualityScores` with reasoning

### Phase 3: Orchestration & Reporting

6. **YAML loader** (`src/loaders/yaml-loader.ts`)
   - Load test cases from directory
   - Validate against schema

7. **Evaluation service** (`src/evaluation-service.ts`)
   - Orchestrate: load tests → run → collect results → report
   - Filter by `testCaseIds` or `tags`
   - Generate summary: pass rate, avg quality scores, avg metrics

8. **Reporters**
   - `console-reporter.ts`: Colored CLI output with pass/fail per test
   - `json-reporter.ts`: Save results to `data/evaluations/results/`

### Phase 4: CLI Integration

9. **Add eval tools to system plugin** (`plugins/system/src/tools/`)
   - `system_eval_run`: Run test suite with options (tags, skipLLMJudge)
   - `system_eval_list`: List available test cases

### Phase 5: Sample Test Cases

10. **Create initial test cases** in `data/evaluations/test-cases/`
    - `tool-invocation/system-search.yaml` - Verify search tool gets called
    - `tool-invocation/entity-create.yaml` - Verify entity creation
    - `response-quality/helpful-response.yaml` - LLM judge quality check

## Key Interfaces

```typescript
// From shell/agent-service/src/types.ts (existing)
interface AgentResponse {
  text: string;
  toolResults?: ToolResultData[];
  usage: { promptTokens; completionTokens; totalTokens };
}

// New: Test Case
interface TestCase {
  id: string;
  name: string;
  type: "tool_invocation" | "response_quality" | "multi_turn";
  turns: { userMessage: string; successCriteria?: SuccessCriteria }[];
  successCriteria: SuccessCriteria;
  efficiency?: { maxTokens?; maxToolCalls?; maxDurationMs? };
}

// New: Success Criteria
interface SuccessCriteria {
  expectedTools?: { toolName: string; shouldBeCalled: boolean }[];
  responseContains?: string[];
  responseNotContains?: string[];
  minHelpfulnessScore?: number; // 0-5, requires LLM judge
}

// New: Evaluation Result
interface EvaluationResult {
  testCaseId: string;
  passed: boolean;
  totalMetrics: { totalTokens; toolCallCount; durationMs };
  qualityScores?: { helpfulness; accuracy; instructionFollowing };
  failures?: { criterion; expected; actual }[];
}
```

## Sample Test Case (YAML)

```yaml
id: tool-invocation-search
name: System Search Invocation
type: tool_invocation
tags: [core, search]

turns:
  - userMessage: "Search for notes about TypeScript"

successCriteria:
  expectedTools:
    - toolName: system_search
      shouldBeCalled: true
  responseNotContains:
    - "I cannot"
    - "I don't have access"

efficiency:
  maxToolCalls: 3
  maxTokens: 2000
```

## Files to Create

| File                                                             | Purpose              |
| ---------------------------------------------------------------- | -------------------- |
| `shell/agent-evaluation/package.json`                            | Package config       |
| `shell/agent-evaluation/src/index.ts`                            | Public exports       |
| `shell/agent-evaluation/src/types.ts`                            | Type definitions     |
| `shell/agent-evaluation/src/schemas/test-case.ts`                | Test case Zod schema |
| `shell/agent-evaluation/src/schemas/evaluation-result.ts`        | Result Zod schema    |
| `shell/agent-evaluation/src/metric-collector.ts`                 | Metric extraction    |
| `shell/agent-evaluation/src/test-runner.ts`                      | Test execution       |
| `shell/agent-evaluation/src/llm-judge.ts`                        | Quality scoring      |
| `shell/agent-evaluation/src/loaders/yaml-loader.ts`              | YAML loading         |
| `shell/agent-evaluation/src/evaluation-service.ts`               | Main orchestration   |
| `shell/agent-evaluation/src/reporters/console-reporter.ts`       | CLI output           |
| `shell/agent-evaluation/src/reporters/json-reporter.ts`          | JSON export          |
| `shell/agent-evaluation/test/test-runner.test.ts`                | Unit tests           |
| `data/evaluations/test-cases/tool-invocation/system-search.yaml` | Sample test          |

## Files to Modify

| File                                | Change              |
| ----------------------------------- | ------------------- |
| `plugins/system/src/plugin.ts`      | Register eval tools |
| `plugins/system/src/tools/index.ts` | Export eval tools   |

## Test Isolation

- Use `AgentService.createFresh()` with isolated conversation service
- Test cases run against real tools but isolated database
- LLM judge can be skipped for fast iteration (`skipLLMJudge: true`)
