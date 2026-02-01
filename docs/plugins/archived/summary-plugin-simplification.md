# Summary Plugin Simplification Plan

## Executive Summary

The Summary plugin implementation has become overcomplicated compared to its original design. This document outlines a plan to simplify it back to the original vision: simple, readable conversation summaries stored as natural markdown.

## Problem Analysis

### What Went Wrong

The implementation diverged from the original plan in several key ways:

1. **Over-structured Schema**: Added 6 unnecessary fields (windowStart, windowEnd, keyPoints, decisions, actionItems, participants) to SummaryLogEntry
2. **Complex Parsing**: Used StructuredContentFormatter for machine-parseable structure instead of human-readable markdown
3. **Over-engineered AI**: Two separate AI schemas and calls instead of one simple summarization
4. **Excessive Code**: 2,152 lines for what should be ~800 lines

### Original Vision vs Current Reality

| Aspect          | Original Plan                        | Current Implementation                         |
| --------------- | ------------------------------------ | ---------------------------------------------- |
| Entry Fields    | 4 (title, content, created, updated) | 10 fields                                      |
| Markdown Format | Simple readable text                 | Complex structured sections                    |
| AI Processing   | Single summarization                 | Decision + content generation                  |
| Code Complexity | Simple string operations             | StructuredContentFormatter with field mappings |
| Lines of Code   | ~800 estimated                       | 2,152 actual                                   |

## Simplified Design

### Core Principles

1. **Natural Language First**: Summaries should read like human-written notes
2. **Simple Storage**: Plain markdown without complex parsing requirements
3. **AI Freedom**: Let AI include details naturally in prose, not forced structures
4. **Minimal Schema**: Only essential metadata fields

### Schema Simplification

#### Before (Current - Overcomplicated)

```typescript
export const summaryLogEntrySchema = z.object({
  title: z.string(),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  windowStart: z.number(), // REMOVE
  windowEnd: z.number(), // REMOVE
  keyPoints: z.array(z.string()), // REMOVE
  decisions: z.array(z.string()), // REMOVE
  actionItems: z.array(z.string()), // REMOVE
  participants: z.array(z.string()), // REMOVE
});
```

#### After (Simplified)

```typescript
export const summaryLogEntrySchema = z.object({
  title: z.string().describe("Brief topic or phase description"),
  content: z
    .string()
    .describe("Natural summary prose including all relevant details"),
  created: z.string().datetime().describe("When this entry was created"),
  updated: z.string().datetime().describe("When this entry was last updated"),
});
```

### Markdown Format Simplification

#### Before (Complex Structure)

```markdown
### [2025-01-01T00:00:00Z] Test Entry

## Content

Test content

## Window Start

1

## Window End

50

## Key Points

- Point 1
- Point 2

## Decisions

- Decision 1

## Action Items

- Action 1

---
```

#### After (Natural Prose)

```markdown
### [2025-01-01T00:00:00Z] Test Entry

Discussion about project architecture. Team evaluated microservices
vs monolith approaches. Key decision: adopt microservices with
Kubernetes. Action items: prepare infrastructure cost breakdown,
submit headcount request for 2 senior engineers.

---
```

## Implementation Changes

### 1. SummaryAdapter Simplification

**Remove:**

- StructuredContentFormatter usage
- Field mapping logic
- Complex parsing with formatters

**Replace with:**

```typescript
// Simple markdown generation
private formatEntry(entry: SummaryLogEntry): string {
  const header = entry.created === entry.updated
    ? `### [${entry.created}] ${entry.title}`
    : `### [${entry.created} - Updated ${entry.updated}] ${entry.title}`;

  return `${header}\n\n${entry.content}\n\n---\n`;
}

// Simple parsing
private parseEntry(section: string): SummaryLogEntry {
  const lines = section.split('\n');
  const headerLine = lines[0];
  const content = lines.slice(2).join('\n').replace(/\n---$/, '').trim();

  // Extract timestamp and title from header
  const match = headerLine.match(/\[(.*?)\] (.*)$/);
  const [timestamp, title] = match ? [match[1], match[2]] : ['', ''];

  // Check for update timestamp
  let created = timestamp;
  let updated = timestamp;
  if (timestamp.includes(' - Updated ')) {
    [created, updated] = timestamp.split(' - Updated ');
  }

  return { title, content, created, updated };
}
```

### 2. AI Processing Simplification

**Remove:**

- aiDecisionResultSchema
- aiSummaryResultSchema
- Two-phase AI processing

**Replace with:**

```typescript
// Single AI call with simple prompt
const prompt = `
Analyze this conversation digest. Either:
1. Update one of the recent entries if the topic continues
2. Create a new entry if it's a new topic

Recent entries:
${recentEntries.map((e) => `- ${e.title}: ${e.content}`).join("\n")}

New messages:
${digest.messages.map((m) => `${m.role}: ${m.content}`).join("\n")}

Respond with:
- action: "update" or "new"
- entryIndex: (if updating, which entry 0-2)
- title: Entry title
- content: Natural summary paragraph

The content should be a natural paragraph that includes any important
decisions, action items, or key points as you see fit.
`;

// Simple response parsing
const response = await context.generateContent(prompt);
const lines = response.split("\n");
// ... basic parsing logic
```

### 3. DataSource Simplification

**Keep:** The DataSource pattern for consistency

**Simplify:**

```typescript
async transform<T>(data: unknown, templateId?: string): Promise<T> {
  if (templateId === "summary-detail") {
    const entity = data as SummaryEntity;
    return {
      conversationId: entity.metadata?.conversationId,
      content: entity.content, // Just pass markdown directly
    } as T;
  }

  if (templateId === "summary-list") {
    const entities = Array.isArray(data) ? data : [data];
    return {
      summaries: entities.map(s => ({
        id: s.id,
        conversationId: s.metadata?.conversationId,
        // Extract first line after header as preview
        preview: extractFirstLine(s.content),
        lastUpdated: s.updated,
      })),
    } as T;
  }

  return data as T;
}
```

### 4. Template Simplification

Templates can now just render markdown content directly without complex entry iteration:

```tsx
// summary-detail layout.tsx
export const Layout = ({ content }: SummaryDetailData) => (
  <div class="summary-detail">
    <MarkdownRenderer content={content} />
  </div>
);
```

## File Changes Summary

| File                              | Action                            | Lines Saved            |
| --------------------------------- | --------------------------------- | ---------------------- |
| schemas/summary.ts                | Remove 6 fields                   | ~30                    |
| adapters/summary-adapter.ts       | Remove StructuredContentFormatter | ~200                   |
| lib/summary-extractor.ts          | Simplify AI logic                 | ~150                   |
| datasources/summary-datasource.ts | Simplify transform                | ~80                    |
| templates/\*/layout.tsx           | Simplify rendering                | ~100                   |
| All test files                    | Update for simpler structure      | ~300                   |
| **Total**                         |                                   | **~860 lines removed** |

## Implementation Checklist

### Phase 1: Schema Simplification

- [ ] Update summaryLogEntrySchema to 4 fields only
- [ ] Remove aiDecisionResultSchema
- [ ] Remove aiSummaryResultSchema
- [ ] Update summaryBodySchema if needed
- [ ] Run typecheck to find all breaking changes

### Phase 2: Adapter Rewrite

- [ ] Remove StructuredContentFormatter import
- [ ] Rewrite createSummaryContent() with simple string concat
- [ ] Rewrite parseSummaryContent() with simple regex/split
- [ ] Update addOrUpdateEntry() for simpler structure
- [ ] Test roundtrip integrity

### Phase 3: AI Simplification

- [ ] Merge analyzeDigest() and generateSummary() logic
- [ ] Single AI prompt for decision + content
- [ ] Simple string parsing of AI response
- [ ] Remove complex validation

### Phase 4: Component Updates

- [ ] Simplify DataSource transform methods
- [ ] Update template schemas
- [ ] Simplify template layouts
- [ ] Update all imports/types

### Phase 5: Test Updates

- [ ] Update adapter tests for simple parsing
- [ ] Update extractor tests for single AI call
- [ ] Update handler tests for new flow
- [ ] Update datasource tests
- [ ] Ensure all 102 tests pass

## Expected Outcomes

### Quantitative

- **Code Reduction**: ~40% fewer lines (2,152 → ~1,300)
- **Complexity**: Remove 6 unnecessary schema fields
- **Dependencies**: Remove StructuredContentFormatter dependency

### Qualitative

- **Readability**: Summaries are natural prose, not structured data
- **Maintainability**: Simple string operations vs complex parsing
- **Flexibility**: AI has freedom to write naturally
- **Debuggability**: Markdown is human-readable without tools

## Migration Strategy

Since this is a significant simplification:

1. **Branch Strategy**: Create `feature/summary-simplification` branch
2. **Incremental Changes**: Follow phases above with commits after each
3. **Test Continuously**: Run tests after each phase
4. **Data Migration**: Existing summaries will need migration script (separate task)

## Success Criteria

The simplification is successful when:

1. ✅ All tests pass with simplified structure
2. ✅ Code reduced by ~40%
3. ✅ Summaries read naturally without structured sections
4. ✅ AI generates better summaries with freedom to write naturally
5. ✅ No StructuredContentFormatter dependency
6. ✅ Templates render simple markdown content

## Risks and Mitigations

| Risk                               | Mitigation                                    |
| ---------------------------------- | --------------------------------------------- |
| Loss of structured data            | AI can still include these naturally in prose |
| Existing summaries incompatible    | Write migration script if needed              |
| Tests heavily coupled to structure | Rewrite tests to focus on behavior            |
| Templates expect structured data   | Simplify templates to render markdown         |

## Conclusion

This simplification returns the Summary plugin to its original vision: a simple, readable log of conversation summaries. By removing unnecessary structure and letting AI write naturally, we achieve better summaries with less code.

The key insight: **Structure should emerge from content, not be imposed upon it.**
