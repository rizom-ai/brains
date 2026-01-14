# MCP Prompts Implementation Plan

**Date**: 2025-10-20
**Status**: Planning
**Goal**: Add reusable prompt templates to Personal Brain MCP interface to improve usability and reduce cognitive load

---

## Executive Summary

The Personal Brain currently exposes 30+ powerful tools through MCP, but discovering and combining these tools requires significant knowledge of the system. MCP Prompts would provide pre-built workflows that:

- **Reduce cognitive load** - One selection instead of multiple tool calls
- **Improve discoverability** - Browse capabilities by workflow instead of API names
- **Ensure completeness** - Prompts fetch all relevant context automatically
- **Save time** - Common workflows become instant
- **Better AI responses** - Comprehensive context leads to better Claude answers

**Recommended approach**: Implement in phases, starting with 5-8 essential prompts that cover 80% of use cases.

---

## Current State Analysis

### What We Have

- **30+ MCP tools** across 6 plugins (system, link, topics, summary, site-builder, git)
- **4 entity types**: Links, Topics, Summaries, (Site Content)
- **Multiple search methods**: Vector search, keyword search, topic extraction
- **Rich metadata**: Tags, timestamps, relationships, embeddings
- **Background jobs**: Async processing with progress tracking
- **Conversation tracking**: Full history with summaries

### The Problem

**Powerful but complex** - Users must:

1. Know which tools exist
2. Understand what each does
3. Remember parameter formats
4. Combine multiple tools manually
5. Structure prompts to Claude themselves

**Example**: To review knowledge about a topic requires:

- `system:query` for general search
- `topics-search` for related topics
- `link:search` for captured resources
- `summary-list` for conversation context
- Manual synthesis of results

### What's Missing

**Pre-built workflows** that combine tools intelligently and present results in a structured format ready for Claude to process.

---

## Value Proposition

### For Daily Use

**Before Prompts:**

```
Morning routine: 10-15 minutes
- Manually check conversations
- Search for new links
- Review topics
- Look at summaries
- Try to remember what's important
```

**With `daily-briefing` prompt:**

```
Morning routine: 30 seconds
- Select prompt
- Get comprehensive overview
- All context automatically gathered
```

### For Research

**Before Prompts:**

```
Research a topic: 5-10 minutes
- Try system:query
- Remember to check topics
- Search links separately
- Manually correlate results
- Hope you didn't miss anything
```

**With `knowledge-about` prompt:**

```
Research a topic: 30 seconds
- Select prompt, enter topic
- Get everything: queries, topics, links, discussions
- All formatted and ready for analysis
```

### For Weekly Reviews

**Before Prompts:**

```
Weekly review: 20-30 minutes
- Try to remember what happened
- Manually search through data
- Piece together activities
- Create your own structure
```

**With `weekly-review` prompt:**

```
Weekly review: 2-3 minutes
- Select prompt
- Get structured overview
- Guided reflection questions
- Ready to capture insights
```

### Key Benefits

1. **80% time savings** on common workflows
2. **100% context coverage** - never miss relevant information
3. **Zero learning curve** - browse and select instead of memorizing APIs
4. **Better AI responses** - comprehensive, structured context
5. **Progressive disclosure** - beginners use prompts, power users still have tool access

---

## Complete Prompt Inventory

### Category 1: Knowledge Discovery & Review (7 prompts)

#### `daily-briefing`

**Purpose**: Morning overview of recent activity
**Arguments**:

- `days` (optional, default: 1) - Days to review

**Fetches**:

- Recent conversations (`system:list-conversations`)
- New links (`link:list` with date filter)
- Extracted topics (`topics-list` sorted by date)
- New summaries (`summary-list` with recency)

**Output Format**:

```markdown
## Recent Activity (Last 1 day)

- [x] conversations with [Y] total messages
- Top conversations: [list with participants]

## New Knowledge Captured

- [N] links saved
  - [URL]: [Title] - [Summary]

## Topics Discussed

- [Topic]: [Relevance score] - [Summary]

## Conversation Summaries

- [Conversation]: [Key points]
```

**Use Case**: Daily routine to see what's new and important

---

#### `knowledge-about`

**Purpose**: Comprehensive deep dive into a topic
**Arguments**:

- `topic` (required) - The subject to explore
- `depth` (optional: "quick", "detailed", "comprehensive", default: "detailed")

**Fetches**:

- Direct search results (`system:query`)
- Related topics (`topics-search`)
- Captured resources (`link:search`)
- Conversation mentions (`summary-list` + filtering)

**Output Format**:

```markdown
## Direct Knowledge: [topic]

[system:query results with excerpts]

## Related Topics

- [Topic 1]: [Relationship] - [Summary]
- [Topic 2]: [Relationship] - [Summary]

## Captured Resources

- [Link 1]: [Title]
  Summary: [AI-generated summary]
  Keywords: [tags]

## From Conversations

- [Conversation ID]: [Excerpt mentioning topic]
  Context: [surrounding discussion]

## Synthesis

Please synthesize all this information into a comprehensive overview of [topic].
```

**Use Case**: Research, learning, preparing for discussions

---

#### `recent-learnings`

**Purpose**: What have I learned recently?
**Arguments**:

- `days` (optional, default: 7) - Time window
- `filter` (optional: "links", "topics", "summaries", "all", default: "all")

**Fetches**:

- New links (`link:list` date-filtered)
- New topics (`topics-list` date-filtered)
- New summary entries (date-filtered)

**Output Format**:

```markdown
## Learning from Last [N] Days

### New Concepts (Topics)

- [Topic]: [Summary]
  Sources: [conversation/link references]

### Resources Captured

- [URL]: [Title]
  Key takeaways: [extracted from summary]

### Conversation Insights

- From [Conversation]: [Key insights from summary entries]

## Themes & Patterns

Please identify the key themes and interesting connections in these learnings.
```

**Use Case**: Weekly reviews, identifying learning patterns

---

#### `find-connections`

**Purpose**: Explore relationships between concepts
**Arguments**:

- `topic1` (required) - First concept
- `topic2` (required) - Second concept
- `include_indirect` (optional, boolean, default: false) - Include weak relationships

**Fetches**:

- Topics for each concept
- Entities tagged with both
- Conversations mentioning both
- Common keywords/tags

**Output Format**:

```markdown
## Connections: [topic1] ↔ [topic2]

### Direct Overlap

- Topics mentioning both: [list]
- Shared keywords: [list]

### Shared Resources

- Links tagged with both:
  - [URL]: [How it relates to both topics]

### Conversation Context

- [Conversation]: Discussed both in context of [theme]

### Indirect Connections (if enabled)

- Via [intermediate topic/entity]

## Analysis

Please analyze the relationships and suggest areas for deeper exploration.
```

**Use Case**: Research, identifying knowledge gaps, creative thinking

---

#### `conversation-recap`

**Purpose**: Get caught up on a specific conversation
**Arguments**:

- `conversation_id` (required)
- `messages` (optional, default: 50) - How many recent messages

**Fetches**:

- Conversation metadata (`system:get-conversation`)
- Recent messages (`system:get-messages`)
- Summary if exists (`summary-get`)

**Output Format**:

```markdown
## Conversation Recap: [conversation_id]

### Details

- Channel: [name]
- Started: [timestamp]
- Total messages: [count]
- Last active: [timestamp]

### Recent Messages (last [N])

[Message history with timestamps and roles]

### Summary (if available)

[Existing summary entries with key points]

## Where We Left Off

Please provide a concise recap of the current state and context.
```

**Use Case**: Resuming conversations after breaks

---

#### `action-items`

**Purpose**: Extract all pending actions from conversations
**Arguments**:

- `status` (optional: "pending", "completed", "all", default: "pending")
- `timeframe` (optional: "week", "month", "all", default: "week")

**Fetches**:

- Summaries with action item extraction
- Recent conversations with action indicators

**Output Format**:

```markdown
## Action Items: [status] ([timeframe])

### From Summaries

- [Action]: [Context]
  Source: [Conversation] on [date]

### Grouped by Priority

#### High Priority

- [Actions from recent/important conversations]

#### Medium Priority

- [Other clear actions]

#### Low Priority / FYI

- [Mentioned but not urgent]

## Recommendations

Please prioritize these actions and suggest next steps.
```

**Use Case**: Task management, weekly planning

---

#### `similar-to`

**Purpose**: Find similar entities to a given one
**Arguments**:

- `entity_type` (required: "link", "topic", "summary")
- `entity_id` (required)
- `limit` (optional, default: 10)

**Fetches**:

- Entity details (`system:get`)
- Vector similarity search
- Tag/keyword overlap analysis

**Output Format**:

```markdown
## Similar to: [entity_type]:[entity_id]

### Original Entity

[Full entity details]

### Similar Entities (by relevance)

1. [Entity]: [Similarity score]
   Shared: [common tags/keywords]
   Why similar: [explanation]

### Common Themes

[Shared topics, keywords, or concepts]

## Insights

What patterns emerge from these similar entities?
```

**Use Case**: Discovery, finding related content

---

### Category 2: Research & Analysis (5 prompts)

#### `research-summary`

**Purpose**: Synthesize all knowledge to answer a research question
**Arguments**:

- `question` (required) - Research question
- `format` (optional: "brief", "detailed", "academic", default: "detailed")

**Fetches**:

- Knowledge base search (`system:query`)
- Related topics (`topics-search`)
- Source materials (`link:search`)

**Output Format**:

```markdown
## Research Question: [question]

Format: [format]

### Relevant Knowledge

[Direct search results with excerpts and citations]

### Supporting Concepts

[Related topics that provide context]

### External Resources

[Captured links about the topic]

- [URL]: [Title]
  Relevance: [How it addresses the question]

## Synthesis

Please provide a [format] answer to the research question, citing sources.
```

**Use Case**: Learning, preparing explanations, research

---

#### `gap-analysis`

**Purpose**: Identify what you don't know yet about a topic
**Arguments**:

- `topic` (required)
- `context` (optional) - What you're trying to achieve

**Fetches**:

- Current knowledge (`system:query`, `topics-get`)
- Related entities (`link:search`, topic relationships)
- Keyword coverage analysis

**Output Format**:

```markdown
## Gap Analysis: [topic]

Context: [context if provided]

### Current Knowledge

- Topics covered: [list]
- Resources captured: [count] links
- Key concepts understood: [from topics and summaries]

### Coverage Analysis

- Frequently mentioned: [strong areas]
- Mentioned but not deep: [weak areas]
- Not mentioned: [potential gaps based on topic]

### Recommendations

Based on [context], what gaps should you fill?
What should you learn next?
What resources might help?
```

**Use Case**: Learning planning, identifying knowledge gaps

---

#### `compare-concepts`

**Purpose**: Side-by-side comparison of ideas/technologies
**Arguments**:

- `concept1` (required)
- `concept2` (required)
- `criteria` (optional, array) - What to compare on

**Fetches**:

- Knowledge about each concept
- Topics for each
- Resources for each

**Output Format**:

```markdown
## Comparison: [concept1] vs [concept2]

Criteria: [list or "general comparison"]

### [Concept1]

[All related knowledge, topics, resources]

### [Concept2]

[All related knowledge, topics, resources]

### Comparison Table

| Criterion                           | [Concept1] | [Concept2] |
| ----------------------------------- | ---------- | ---------- |
| [Each criterion or general aspects] |            |            |

## Recommendation

Which is better for [implied or stated use case]?
```

**Use Case**: Technology decisions, understanding tradeoffs

---

#### `write-about`

**Purpose**: Draft content using Brain knowledge
**Arguments**:

- `topic` (required)
- `style` (optional: "blog", "documentation", "tutorial", "explanation", default: "explanation")
- `audience` (optional, default: "technical")

**Fetches**:

- Comprehensive topic knowledge
- Sources for citations
- Related concepts for context

**Output Format**:

```markdown
## Draft: [topic]

Style: [style]
Audience: [audience]

### Available Knowledge

[All relevant entities, topics, summaries]

### Source Materials

[Links with URLs for citation]

### Related Concepts

[Topics for additional context]

## Request

Please draft [style] content about [topic] for [audience] using this knowledge.
Cite sources where appropriate.
```

**Use Case**: Blog posts, documentation, explanations

---

#### `surprise-me`

**Purpose**: Discover unexpected connections or forgotten knowledge
**Arguments**:

- `starting_topic` (optional) - Where to start
- `hops` (optional, 1-3, default: 2) - Degrees of separation

**Fetches**:

- Random or specified starting entity
- Related topics (1 hop)
- Topics related to related topics (2+ hops)
- Old entities you might have forgotten

**Output Format**:

```markdown
## Surprise Discovery Journey

Starting: [topic or "random"]
Exploration depth: [hops] hops

### Starting Point

[Initial entity/topic details]

### Related Topics (1 hop)

[Directly connected topics]

### Distant Connections ([N] hops)

[Surprisingly related topics]

- [Topic]: Connected via [intermediate topics]

### Forgotten Resources

[Old links/entities you captured but might not remember]

## Discoveries

What interesting or unexpected connections did we find?
What have you forgotten that's worth revisiting?
```

**Use Case**: Creative thinking, rediscovery, serendipity

---

### Category 3: Productivity & Workflow (6 prompts)

#### `weekly-review`

**Purpose**: Comprehensive weekly reflection
**Arguments**:

- `week_offset` (optional, default: 0) - 0=current week, 1=last week

**Fetches**:

- Week's conversations
- Week's topics
- Week's links
- Week's summaries
- Activity statistics

**Output Format**:

```markdown
## Weekly Review: Week of [date range]

### Conversations

- [N] conversations with [M] total messages
- Top conversations:
  - [ID]: [participants], [message count]

### Topics Discussed

[Topics extracted this week]

- [Topic]: [Relevance] - [Summary]

### Resources Captured

[Links saved this week]

- [URL]: [Title] - [Why captured]

### Summary of Learnings

[Key points from conversation summaries]

### Statistics

- Total entities created: [count]
- Most active day: [day]
- Most discussed topic: [topic]

## Reflection Questions

1. What were the main themes this week?
2. What questions remain unanswered?
3. What should I follow up on next week?
4. What did I learn that was surprising?
```

**Use Case**: Weekly planning, reflection, tracking progress

---

#### `monthly-themes`

**Purpose**: Identify patterns over a month
**Arguments**:

- `month_offset` (optional, default: 0)

**Fetches**:

- Month's topics with frequency
- Conversation patterns
- Entity creation trends
- Tag analysis

**Output Format**:

```markdown
## Monthly Themes: [month/year]

### Top Topics

[Most discussed topics with occurrence counts]

### Knowledge Areas

- Links: [count] ([trend vs last month])
- Topics: [count] ([trend])
- Summaries: [count] ([trend])

### Conversation Patterns

- Average messages per conversation: [stat]
- Most active interface: [interface]
- Peak activity day: [day]

### Tag Analysis

[Most common tags/keywords]

### Theme Analysis

What are the emerging patterns and focus areas?
How has your interest shifted compared to last month?
```

**Use Case**: Long-term tracking, goal setting

---

#### `focus-session`

**Purpose**: Prepare for focused work on a topic
**Arguments**:

- `topic` (required)
- `goal` (optional) - What you want to accomplish
- `duration` (optional) - How long you'll work

**Fetches**:

- All knowledge about topic
- Related resources
- Pending actions related to topic

**Output Format**:

```markdown
## Focus Session: [topic]

Goal: [goal]
Duration: [duration]

### Current Knowledge

[Relevant topics, summaries, entities]

### Resources to Reference

[Captured links and their summaries]

### Related Actions

[Any pending action items for this topic]

### Session Plan

Based on your goal and available knowledge:

1. [Suggested first step]
2. [Next steps]
3. [How to use the time]

### Success Criteria

How will you know the session was productive?

Ready to begin?
```

**Use Case**: Deep work sessions, focused learning

---

#### `wrap-up-session`

**Purpose**: Document learnings at end of work session
**Arguments**:

- `topic` (required)
- `what_learned` (optional) - Quick notes

**Interactive prompt that guides:**

- What did we accomplish?
- What key insights emerged?
- What should be captured (link/topic)?
- What's the next step?

**Output Format**:

```markdown
## Session Wrap-up: [topic]

### Session Review

Duration: [if started with focus-session]
Goal: [if set]

### What We Did

[Summary of conversation/activities]

### Key Insights

[Important learnings to capture]

### Entities to Create

Based on our session, I recommend:

- [ ] Create topic: [suggested topic]
- [ ] Capture link: [if reference was used]
- [ ] Update summary: [if part of ongoing conversation]

### Next Steps

- [Suggested follow-up actions]

Should I create these entities for you?
```

**Use Case**: Session documentation, knowledge capture

---

#### `decisions-made`

**Purpose**: Review decisions from conversations
**Arguments**:

- `timeframe` (optional: "week", "month", "all", default: "week")
- `topic` (optional) - Filter by topic area

**Fetches**:

- Summaries with decision extraction
- Conversation excerpts with decision indicators

**Output Format**:

```markdown
## Decisions Made: [timeframe]

Topic filter: [topic if specified]

### Decisions

[Chronological list of decisions from summaries]

For each:

- **Decision**: [What was decided]
- **Context**: [Why/when]
- **Source**: [Conversation reference]
- **Status**: [If implementation mentioned]

### By Category

[Group decisions by topic/area]

### Implementation Status

- Implemented: [count]
- In progress: [count]
- Not started: [count]
```

**Use Case**: Decision tracking, accountability

---

#### `conversation-history`

**Purpose**: Search across all conversations
**Arguments**:

- `query` (optional) - Search term
- `channel` (optional) - Filter by channel/interface
- `limit` (optional, default: 10)

**Fetches**:

- Conversations matching query
- Related summaries

**Output Format**:

```markdown
## Conversation History

Query: [query]
Channel: [channel filter]

### Matching Conversations

[List with metadata]

- [ID]: [Started] - [Last active]
  Messages: [count]
  Participants: [if applicable]
  Excerpt: [Relevant portion]

### Related Summaries

[Summary entries matching query]

### Timeline

[Chronological view if useful]
```

**Use Case**: Finding past discussions, context recovery

---

### Category 4: System & Monitoring (3 prompts)

#### `system-status`

**Purpose**: Health check and overview
**Arguments**: None

**Fetches**:

- System status (`system:get-status`)
- Job queue status
- Entity counts by type
- Recent activity metrics

**Output Format**:

```markdown
## System Status

### Core Services

- Status: [from system:get-status]
- Model: [AI model info]
- Interfaces: [active interfaces]

### Knowledge Base

- Total entities: [count]
  - Links: [count]
  - Topics: [count]
  - Summaries: [count]
  - Site content: [count]

### Background Jobs

- Active: [count]
- Queued: [count]
- Recent completions: [count]
- Any failures: [count with errors]

### Recent Activity (24h)

- Conversations: [count]
- Entities created: [count]
- Jobs completed: [count]

### Health

[Overall health assessment]
```

**Use Case**: System monitoring, health checks

---

#### `job-overview`

**Purpose**: Monitor background processing
**Arguments**:

- `batch_id` (optional) - Specific batch
- `status` (optional: "active", "completed", "failed", default: "active")

**Fetches**:

- Job status details

**Output Format**:

```markdown
## Background Jobs

Status filter: [status]
Batch: [batch_id if specified]

### Active Jobs

[Job details with progress]

- [Job ID]: [Type]
  Progress: [percentage]
  Status: [current operation]

### Recently Completed

[Last 10 completed jobs]

### Failed Jobs (if any)

[Jobs with errors and error messages]

### Statistics

- Total jobs today: [count]
- Success rate: [percentage]
- Average completion time: [time]
```

**Use Case**: Monitoring, debugging

---

#### `content-gaps`

**Purpose**: Identify missing content for site generation
**Arguments**: None

**Fetches**:

- Site routes
- Available content
- Template requirements

**Output Format**:

```markdown
## Site Content Analysis

### Routes Configured

[Total routes and their paths]

### Content Status

- Routes with content: [count/total]
- Routes without content: [count/total]

### Missing Content

[Routes that need content generation]

- [Route]: [Required sections]
  Template: [template name]
  Status: [not generated/stale]

### Templates

- Registered: [count]
- Used: [count]
- Unused: [list]

### Recommendations

[Suggested content to create]
[Routes to generate for]
```

**Use Case**: Site building, content planning

---

### Category 5: Site Building (1 prompt)

#### `site-preview`

**Purpose**: Check what would be published
**Arguments**:

- `environment` (optional: "preview", "production", default: "production")

**Fetches**:

- Route listing
- Build status
- Content readiness

**Output Format**:

```markdown
## Site Preview: [environment]

### Registered Routes

[All routes with paths, descriptions]

### Build Status

- Last build: [timestamp]
- Environment: [preview/production]
- Status: [success/failed]
- Warnings: [any issues]

### Content Status

- Generated: [route count]
- Needs generation: [route count]
- Stale: [outdated content count]

### Ready to Build?

[Assessment of whether site is ready]
[Any blockers or warnings]
```

**Use Case**: Pre-publication check

---

## Implementation Plan

### Phase 1: Infrastructure (Foundation)

**Goal**: Add prompt capability to MCP interface

**Files to modify:**

1. `interfaces/mcp/src/mcp-interface.ts`
   - Add `protected override async getPrompts(): Promise<PluginPrompt[]>` method
   - Import prompt definitions
   - Register prompts with MCP transport

2. Create `interfaces/mcp/src/types.ts` (if doesn't exist) or update
   - Add Prompt type definition:

   ```typescript
   export interface PluginPrompt {
     name: string;
     description: string;
     arguments?: Array<{
       name: string;
       description: string;
       required: boolean;
     }>;
     handler: (
       args: Record<string, unknown>,
       context: InterfacePluginContext,
     ) => Promise<string>;
   }
   ```

3. Update MCP transport registration to include prompts

**Test**: Verify prompts appear in MCP Inspector

**Estimated time**: 2-3 hours

---

### Phase 2: Essential Prompts (High-Value Quick Wins)

**Goal**: Implement 8 most useful prompts

**Prompts to implement:**

1. `daily-briefing` - Morning routine
2. `knowledge-about` - Deep dives
3. `recent-learnings` - Learning tracking
4. `conversation-recap` - Resume conversations
5. `action-items` - Task management
6. `weekly-review` - Reflection
7. `system-status` - Health check
8. `find-connections` - Research

**Files to create:**

- `interfaces/mcp/src/prompts/index.ts` - Export all prompts
- `interfaces/mcp/src/prompts/knowledge.ts` - Knowledge discovery prompts
- `interfaces/mcp/src/prompts/workflow.ts` - Productivity prompts
- `interfaces/mcp/src/prompts/system.ts` - System prompts

**Implementation pattern:**

```typescript
// Example: daily-briefing
export const dailyBriefingPrompt: PluginPrompt = {
  name: "daily-briefing",
  description: "Get a comprehensive overview of recent activity",
  arguments: [
    {
      name: "days",
      description: "Number of days to review (default: 1)",
      required: false,
    },
  ],
  handler: async (args, context) => {
    const days = (args.days as number) || 1;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Fetch data from multiple sources
    const conversations = await context.executeCommand(
      "system:list-conversations",
      { limit: 10 },
    );
    const links = await context.executeCommand("link:list", { limit: 20 });
    const topics = await context.executeCommand("topics-list", { limit: 15 });
    const summaries = await context.executeCommand("summary-list", {
      limit: 5,
    });

    // Build structured prompt
    return `
## Daily Briefing - Last ${days} day(s)

### Recent Activity
${formatConversations(conversations)}

### New Knowledge Captured
${formatLinks(links)}

### Topics Discussed
${formatTopics(topics)}

### Conversation Summaries
${formatSummaries(summaries)}

Please provide insights and highlight anything important.
    `.trim();
  },
};
```

**Test cases for each prompt:**

- Empty data (no recent activity)
- Normal data (typical usage)
- Large data (many results)
- Edge cases (missing parameters, etc.)

**Estimated time**: 1-2 days

---

### Phase 3: Research & Analysis (Advanced Prompts)

**Goal**: Add analytical and research-focused prompts

**Prompts to implement:**

1. `research-summary`
2. `gap-analysis`
3. `compare-concepts`
4. `write-about`
5. `surprise-me`

**Files to update:**

- `interfaces/mcp/src/prompts/research.ts` (new)
- `interfaces/mcp/src/prompts/index.ts` (update exports)

**Estimated time**: 1 day

---

### Phase 4: Remaining Workflows (Complete Coverage)

**Goal**: Implement remaining specialized prompts

**Prompts to implement:**

1. `monthly-themes`
2. `focus-session`
3. `wrap-up-session`
4. `decisions-made`
5. `conversation-history`
6. `job-overview`
7. `content-gaps`
8. `site-preview`
9. `similar-to`

**Files to update:**

- `interfaces/mcp/src/prompts/productivity.ts` (new)
- `interfaces/mcp/src/prompts/content.ts` (new)
- `interfaces/mcp/src/prompts/index.ts` (update)

**Estimated time**: 1-2 days

---

## Technical Implementation Details

### Prompt Handler Pattern

```typescript
interface PromptContext {
  // Access to all Brain capabilities
  executeCommand: (name: string, args: unknown) => Promise<unknown>;
  executeToolHandler: (toolId: string, input: unknown) => Promise<ToolResponse>;
  entityService: EntityService;
  logger: Logger;
}

type PromptHandler = (
  args: Record<string, unknown>,
  context: PromptContext,
) => Promise<string>;
```

### Helper Utilities Needed

Create `interfaces/mcp/src/prompts/utils.ts`:

```typescript
// Formatting helpers
export function formatLinks(links: unknown): string;
export function formatTopics(topics: unknown): string;
export function formatConversations(conversations: unknown): string;
export function formatSummaries(summaries: unknown): string;

// Date utilities
export function getDateRange(days: number): { from: Date; to: Date };
export function formatDateRange(from: Date, to: Date): string;

// Data fetching helpers
export async function fetchRecentLinks(context: PromptContext, days: number);
export async function fetchRecentTopics(context: PromptContext, days: number);

// Prompt building utilities
export function buildSection(title: string, content: string): string;
export function buildTable(headers: string[], rows: string[][]): string;
```

### Error Handling

All prompts should:

1. Validate arguments with Zod schemas
2. Handle empty/missing data gracefully
3. Catch and log errors
4. Return helpful error messages in prompt format

```typescript
try {
  // Fetch data
  const data = await fetchData(context);

  if (!data || data.length === 0) {
    return `
## ${promptTitle}

No data found for the specified criteria.

Suggestions:
- Try a wider date range
- Check if any entities exist
- Verify your search terms
    `.trim();
  }

  // Build prompt
  return buildPrompt(data);
} catch (error) {
  context.logger.error(`Prompt ${name} failed`, error);
  return `
## Error in ${promptTitle}

An error occurred while generating this prompt.
Error: ${error.message}

Please try again or contact support if the problem persists.
  `.trim();
}
```

### Testing Strategy

**Unit tests** (for each prompt):

- Argument validation
- Empty data handling
- Normal data formatting
- Error handling

**Integration tests**:

- End-to-end prompt execution
- Tool calling sequence
- Data fetching
- Prompt formatting

**Manual testing checklist**:

- [ ] Prompts appear in MCP Inspector
- [ ] Arguments are editable
- [ ] Generated prompts are well-formatted
- [ ] Claude can process the prompts effectively
- [ ] All data sources are accessible
- [ ] Performance is acceptable (< 2 seconds)

### Performance Considerations

**Optimization strategies:**

1. **Parallel fetching**: Use `Promise.all()` for independent data sources
2. **Limit results**: Don't fetch more than needed
3. **Caching**: Consider caching for frequently accessed data
4. **Lazy loading**: Only fetch what's displayed
5. **Pagination**: For large result sets

**Performance targets:**

- Simple prompts (1-2 tools): < 500ms
- Composite prompts (3-5 tools): < 2s
- Complex prompts (6+ tools): < 5s

### Documentation

Create `docs/mcp-prompts.md`:

- Overview of prompts feature
- List of all available prompts
- Usage examples for each
- How to create custom prompts
- Troubleshooting guide

Update `README.md`:

- Add MCP Prompts to features list
- Link to detailed documentation

---

## Success Metrics

### Adoption Metrics

- **Prompt usage rate**: % of MCP interactions using prompts vs direct tools
- **Top prompts**: Which are used most frequently
- **Time saved**: Estimated based on tool call reduction

### Quality Metrics

- **Completeness**: Do prompts fetch all relevant data?
- **Relevance**: Is the data useful for the use case?
- **Format quality**: Are prompts well-structured for Claude?

### User Experience

- **Discovery**: Can users find the right prompt?
- **Ease of use**: Are arguments clear and easy to provide?
- **Response quality**: Does Claude give better answers with prompts?

### Target Goals (After 2 weeks)

- 60%+ of routine queries use prompts instead of direct tools
- Top 5 prompts account for 80% of usage
- Average interaction time reduced by 50%
- User reports better, more comprehensive answers

---

## Maintenance & Evolution

### Versioning

- Prompts are part of MCP interface version
- Breaking changes require version bump
- Deprecate old prompts before removal

### Feedback Loop

1. Monitor which prompts are used
2. Gather user feedback on quality
3. Identify missing workflows
4. Iterate on prompt design

### Future Enhancements

**Dynamic prompts** (Phase 5+):

- Prompts that adapt based on Brain state
- Context-aware argument suggestions
- Learning from usage patterns

**Custom prompts** (Phase 6+):

- User-defined prompt templates
- Save common query patterns
- Share prompts between users

**Prompt chaining** (Phase 7+):

- Multi-step workflows
- Prompts that call other prompts
- Conditional logic

---

## Risks & Mitigations

### Risk: Prompts generate too much data

**Mitigation**:

- Implement result limits
- Add "depth" parameters
- Provide summary vs detailed modes

### Risk: Poor performance with many tools

**Mitigation**:

- Parallel fetching
- Caching strategies
- Progressive loading

### Risk: Prompts become stale as Brain evolves

**Mitigation**:

- Automated tests catch breaking changes
- Version alongside MCP interface
- Regular review and updates

### Risk: Users prefer direct tool access

**Mitigation**:

- Prompts complement, don't replace tools
- Make both workflows easy
- Gather feedback and iterate

---

## Decision Points

Before starting implementation, decide:

### 1. Which prompts to prioritize?

**Recommendation**: Phase 2 (Essential 8) covers 80% of use cases

### 2. How much automation vs user control?

**Recommendation**:

- Sensible defaults (e.g., days=7 for weekly-review)
- Optional parameters for customization
- "quick" vs "detailed" modes where applicable

### 3. How to handle long-running prompts?

**Recommendation**:

- Most should be fast (< 2s)
- For slow ones, show progress
- Consider async for very long operations

### 4. Static vs dynamic prompts?

**Recommendation**:

- Start static (Phase 2-4)
- Add dynamic features later (Phase 5+)
- Simpler to implement and maintain

### 5. Formatting: Markdown vs structured data?

**Recommendation**:

- Markdown for Claude consumption
- Include structured data in code blocks if needed
- Optimize for AI, not human reading

---

## Next Steps

### To Proceed

1. **Review this plan** - Assess value and effort
2. **Decide on scope** - Full implementation or start with Phase 2?
3. **Approve approach** - Any changes to the design?
4. **Set timeline** - When to implement?

### Quick Start (If Approved)

1. Implement Phase 1 (infrastructure) - 2-3 hours
2. Add 2-3 essential prompts as proof of concept - 4-6 hours
3. Test with real usage - 1-2 days
4. Gather feedback and iterate
5. Complete Phase 2 - 1-2 days
6. Evaluate before Phase 3-4

### Estimated Total Time

- **Phase 1**: 3 hours
- **Phase 2**: 2 days
- **Phase 3**: 1 day
- **Phase 4**: 2 days
- **Testing & docs**: 1 day
- **Total**: ~6-7 days (with iteration)

---

## Appendix A: Prompt Template

```typescript
export const templatePrompt: PluginPrompt = {
  name: "prompt-name",
  description: "Clear description of what this prompt does",
  arguments: [
    {
      name: "required_arg",
      description: "Description of required argument",
      required: true,
    },
    {
      name: "optional_arg",
      description: "Description with default value (default: X)",
      required: false,
    },
  ],
  handler: async (args, context) => {
    // 1. Parse and validate arguments
    const schema = z.object({
      required_arg: z.string(),
      optional_arg: z.string().optional().default("default"),
    });

    let parsed;
    try {
      parsed = schema.parse(args);
    } catch (error) {
      return `Error: Invalid arguments - ${error.message}`;
    }

    // 2. Fetch data (use Promise.all for parallel)
    try {
      const [data1, data2, data3] = await Promise.all([
        context.executeCommand("tool1", { param: parsed.required_arg }),
        context.executeCommand("tool2", { param: parsed.optional_arg }),
        context.executeCommand("tool3", {}),
      ]);

      // 3. Handle empty results
      if (!data1 || (data1 as any[]).length === 0) {
        return `
## Prompt Title

No data found for "${parsed.required_arg}".

Suggestions:
- Try a different search term
- Check if entities exist
        `.trim();
      }

      // 4. Build structured prompt
      const sections = [
        buildSection("Section 1", formatData(data1)),
        buildSection("Section 2", formatData(data2)),
        buildSection("Section 3", formatData(data3)),
      ];

      return `
## Prompt Title: ${parsed.required_arg}

${sections.join("\n\n")}

## Request
Please analyze this information and provide insights.
      `.trim();
    } catch (error) {
      context.logger.error("Prompt failed", error);
      return `
## Error

An error occurred: ${error.message}

Please try again or contact support.
      `.trim();
    }
  },
};

// Helper functions
function formatData(data: unknown): string {
  // Format the data for display
  return JSON.stringify(data, null, 2);
}

function buildSection(title: string, content: string): string {
  return `### ${title}\n${content}`;
}
```

---

## Appendix B: Example Generated Prompts

### Daily Briefing Output

```markdown
## Daily Briefing - Last 1 day(s)

### Recent Activity

- 3 conversations with 47 total messages
- Top conversations:
  - cli-session-123: You, 32 messages
  - matrix-channel-456: You + 2 others, 15 messages

### New Knowledge Captured

- https://example.com/article - "Understanding React Hooks"
  Summary: Comprehensive guide to useState, useEffect, and custom hooks
  Keywords: react, hooks, state-management

- https://example.com/docs - "TypeScript Best Practices"
  Summary: Type safety patterns for large applications
  Keywords: typescript, best-practices

### Topics Discussed

- React Performance (0.85) - Optimizing render cycles and memo usage
- TypeScript Generics (0.72) - Advanced type patterns
- API Design (0.68) - REST vs GraphQL considerations

### Conversation Summaries

- CLI Session: Discussed React performance optimization
  Key points:
  - Use React.memo for expensive components
  - Consider useMemo for expensive calculations
  - Profiler shows re-renders are the bottleneck

Please highlight the key themes and anything that needs follow-up.
```

### Knowledge About Output

```markdown
## Deep Dive: React Hooks

Depth: comprehensive

### Direct Knowledge

From system:query "React Hooks":

- 12 entities found

Excerpt 1 (link:react-hooks-intro):
"Hooks let you use state and other React features without writing a class..."
Tags: react, hooks, state

Excerpt 2 (summary:cli-session-123):
"Discussed when to use useEffect vs useLayoutEffect. Main difference is timing..."

### Related Topics

- React Performance (connected via: state management)
  Summary: Performance optimization patterns in React

- Custom Hooks (connected via: direct relationship)
  Summary: Creating reusable stateful logic

- State Management (connected via: both discuss state)
  Summary: Patterns for managing application state

### Captured Resources

1. https://react.dev/hooks - "Hooks Documentation"
   Summary: Official React hooks reference
   Keywords: react, hooks, official-docs
   Captured: 2025-10-15

2. https://example.com/hooks-guide - "Complete Hooks Guide"
   Summary: In-depth tutorial covering all hooks
   Keywords: react, hooks, tutorial
   Captured: 2025-10-12

### From Conversations

CLI Session (2025-10-19):
"We should use useCallback for event handlers passed to child components to prevent unnecessary re-renders."
Context: Discussing performance optimization

Matrix Channel (2025-10-17):
"Custom hooks are great for encapsulating complex logic. Created useLocalStorage hook today."
Context: Best practices discussion

## Synthesis Request

Please synthesize all this information into a comprehensive overview of React Hooks, including:

- Core concepts and when to use each hook
- Best practices and common patterns
- Performance considerations
- Connections to broader React ecosystem
```

---

## Appendix C: Frequently Asked Questions

**Q: Won't this duplicate functionality we already have?**
A: Prompts don't replace tools - they orchestrate them. Think of tools as functions and prompts as common recipes that call multiple functions in the right sequence.

**Q: How is this different from just asking Claude to call multiple tools?**
A: Prompts ensure completeness (you won't forget to check summaries) and consistency (same structure every time). They also make capabilities discoverable.

**Q: Will prompts slow down the MCP interface?**
A: Prompts should be fast (< 2s target). They use the same tool execution, just automated. Performance may even improve since we can optimize parallel fetching.

**Q: Can I still use tools directly?**
A: Yes! Prompts complement tools, they don't replace them. Power users can still call tools directly when needed.

**Q: How do I know which prompt to use?**
A: Browse by category in MCP Inspector. Each prompt has a clear description and use case. Start with the "essential 8" for common needs.

**Q: What if a prompt doesn't fit my exact need?**
A: Use the closest prompt and then ask Claude to focus on specific aspects, or use tools directly for custom queries.

**Q: Will prompts work with any MCP client?**
A: Yes, prompts are part of the MCP standard. They'll work in Claude Desktop, VSCode, or any MCP-compatible client.

**Q: How often will prompts need updating?**
A: When Brain capabilities change significantly. Otherwise they should be stable. Tests will catch breaking changes.
