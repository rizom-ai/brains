# Roadmap Plugin Implementation Plan

## Overview

The Roadmap plugin provides outcome-based goal tracking with milestone management, evidence linking, and knowledge integration. Unlike traditional task management focused on completion, this plugin emphasizes:

- **Flexible outcomes** (business, personal, research goals)
- **Timeline-agnostic progress** (dependencies over deadlines)
- **Milestone-based tracking** (concrete checkpoints)
- **Evidence linking** (conversations/summaries as proof of progress)
- **Knowledge integration** (connect to topics and research)

## User Requirements Summary

Based on user input:

- **Outcome Type**: Mixed/Flexible - Support business goals, personal development, and research objectives
- **Integration**: Both Evidence & Knowledge - Link conversations as evidence and topics as knowledge
- **Time Scope**: Timeline-agnostic - Focus on progress and dependencies, not strict deadlines
- **Progress Model**: Milestone-Based - Track completion of key milestones/checkpoints

## Architecture

### Core Entities

#### 1. Outcome Entity (`entityType: "outcome"`)

Represents a goal or objective to be achieved.

**Frontmatter Schema**:

```typescript
{
  title: string;
  description: string;
  type: "business" | "personal" | "research";
  status: "planning" | "in-progress" | "achieved" | "archived";
  priority?: "low" | "medium" | "high" | "critical";
  targetDate?: string;  // ISO datetime, optional
  startedAt?: string;
  achievedAt?: string;
  tags: string[];
}
```

**Metadata Schema** (for fast queries):

```typescript
{
  title: string;
  type: "business" | "personal" | "research";
  status: "planning" | "in-progress" | "achieved" | "archived";
  priority?: "low" | "medium" | "high" | "critical";
  targetDate?: string;
}
```

**Storage**: Markdown with YAML frontmatter + content body for rich descriptions

#### 2. Milestone Entity (`entityType: "milestone"`)

Represents concrete checkpoints toward achieving outcomes.

**Frontmatter Schema**:

```typescript
{
  title: string;
  description: string;
  outcomeId: string;  // Reference to parent outcome
  status: "pending" | "in-progress" | "completed" | "blocked";
  progress: number;   // 0-100
  dependencies: string[];  // Array of milestone IDs
  evidenceLinks: Array<{
    type: "summary" | "post" | "topic" | "link" | "deck";
    id: string;
    title: string;  // Cached for display
    note?: string;  // Optional context note
  }>;
  completedAt?: string;
}
```

**Metadata Schema**:

```typescript
{
  title: string;
  outcomeId: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  progress: number;
}
```

**Storage**: Markdown with YAML frontmatter + content body for detailed notes

### Entity Relationships

**Outcome → Milestones** (One-to-Many):

- Query: `listEntities("milestone", { filter: { metadata: { outcomeId } } })`
- No formal foreign key - resolved at query time

**Milestone → Dependencies** (Many-to-Many):

- Stored as array of milestone IDs in frontmatter
- Validated for circular dependencies
- Resolved in datasource when needed

**Milestone → Evidence** (Many-to-Many):

- Stored as rich objects: `{ type, id, title, note }`
- Titles cached to avoid lookup overhead
- Resolved on-demand in datasource
- Handle missing/deleted entities gracefully

## Implementation Phases

### Phase 1: Core Entity System

**Goal**: Establish entity types, schemas, and adapters

**Tasks**:

1. **Create Plugin Structure**
   - Directory: `plugins/roadmap/`
   - Files: `package.json`, `tsconfig.json`, `src/index.ts`, `src/plugin.ts`, `src/config.ts`
   - Extend `ServicePlugin<RoadmapConfig>`

2. **Define Schemas** (`src/schemas/`)

   **File**: `outcome.ts`

   ```typescript
   import { z } from "@brains/utils";
   import { baseEntitySchema } from "@brains/entity-service";

   export const outcomeFrontmatterSchema = z.object({
     title: z.string(),
     description: z.string(),
     type: z.enum(["business", "personal", "research"]),
     status: z.enum(["planning", "in-progress", "achieved", "archived"]),
     priority: z.enum(["low", "medium", "high", "critical"]).optional(),
     targetDate: z.string().datetime().optional(),
     startedAt: z.string().datetime().optional(),
     achievedAt: z.string().datetime().optional(),
     tags: z.array(z.string()).default([]),
   });

   export const outcomeMetadataSchema = z.object({
     title: z.string(),
     type: z.enum(["business", "personal", "research"]),
     status: z.enum(["planning", "in-progress", "achieved", "archived"]),
     priority: z.enum(["low", "medium", "high", "critical"]).optional(),
     targetDate: z.string().datetime().optional(),
   });

   export const outcomeSchema = baseEntitySchema.extend({
     entityType: z.literal("outcome"),
     metadata: outcomeMetadataSchema,
   });

   export const outcomeWithDataSchema = outcomeSchema.extend({
     frontmatter: outcomeFrontmatterSchema,
     body: z.string(),
   });

   export type Outcome = z.infer<typeof outcomeSchema>;
   export type OutcomeMetadata = z.infer<typeof outcomeMetadataSchema>;
   export type OutcomeWithData = z.infer<typeof outcomeWithDataSchema>;
   ```

   **File**: `milestone.ts`

   ```typescript
   export const evidenceLinkSchema = z.object({
     type: z.enum(["summary", "post", "topic", "link", "deck"]),
     id: z.string(),
     title: z.string(),
     note: z.string().optional(),
   });

   export const milestoneFrontmatterSchema = z.object({
     title: z.string(),
     description: z.string(),
     outcomeId: z.string(),
     status: z.enum(["pending", "in-progress", "completed", "blocked"]),
     progress: z.number().min(0).max(100).default(0),
     dependencies: z.array(z.string()).default([]),
     evidenceLinks: z.array(evidenceLinkSchema).default([]),
     completedAt: z.string().datetime().optional(),
   });

   export const milestoneMetadataSchema = z.object({
     title: z.string(),
     outcomeId: z.string(),
     status: z.enum(["pending", "in-progress", "completed", "blocked"]),
     progress: z.number(),
   });

   export const milestoneSchema = baseEntitySchema.extend({
     entityType: z.literal("milestone"),
     metadata: milestoneMetadataSchema,
   });

   export const milestoneWithDataSchema = milestoneSchema.extend({
     frontmatter: milestoneFrontmatterSchema,
     body: z.string(),
   });

   export type Milestone = z.infer<typeof milestoneSchema>;
   export type MilestoneMetadata = z.infer<typeof milestoneMetadataSchema>;
   export type MilestoneWithData = z.infer<typeof milestoneWithDataSchema>;
   export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
   ```

3. **Create Adapters** (`src/adapters/`)

   **Pattern**: Follow `plugins/blog/src/adapters/blog-post-adapter.ts`
   - Implement `EntityAdapter<Outcome, OutcomeMetadata>`
   - Methods: `toMarkdown()`, `fromMarkdown()`, `extractMetadata()`
   - Sync frontmatter → metadata on parse
   - Auto-generate timestamps on status changes

4. **Register Entity Types**
   ```typescript
   // In plugin.ts onRegister()
   context.registerEntityType("outcome", outcomeSchema, new OutcomeAdapter());
   context.registerEntityType(
     "milestone",
     milestoneSchema,
     new MilestoneAdapter(),
   );
   ```

**Reference Files**:

- `plugins/blog/src/schemas/blog-post.ts` (schema patterns)
- `plugins/blog/src/adapters/blog-post-adapter.ts` (adapter patterns)
- `plugins/topics/src/schemas/topic.ts` (relationship references)

---

### Phase 2: Data Layer

**Goal**: Create datasources for querying and relationship resolution

**Tasks**:

1. **Create Outcome DataSource** (`src/datasources/outcome-datasource.ts`)

   **Pattern**: Follow `plugins/blog/src/datasources/blog-datasource.ts`

   **Methods**:
   - `fetchOutcomeList(query)` - All outcomes with filters (type, status, priority)
   - `fetchSingleOutcome(query)` - Single outcome with milestones
   - `fetchOutcomeWithProgress(query)` - Calculate progress from milestones

   **Example**:

   ```typescript
   async fetchSingleOutcome(id: string): Promise<OutcomeDetailData> {
     const outcome = await this.entityService.getEntity("outcome", id);
     const milestones = await this.getAllMilestones(outcome.id);
     const progress = this.calculateProgress(milestones);

     return {
       outcome: parseOutcomeData(outcome),
       milestones: milestones.map(parseMilestoneData),
       overallProgress: progress,
     };
   }
   ```

2. **Create Milestone DataSource** (`src/datasources/milestone-datasource.ts`)

   **Methods**:
   - `fetchMilestoneList(query)` - All milestones with grouping
   - `fetchSingleMilestone(query)` - Milestone with dependencies resolved
   - `fetchMilestoneEvidence(query)` - Resolve evidence links

   **Example**:

   ```typescript
   async fetchSingleMilestone(id: string): Promise<MilestoneDetailData> {
     const milestone = await this.entityService.getEntity("milestone", id);
     const dependencies = await this.resolveDependencies(
       milestone.frontmatter.dependencies
     );
     const evidence = await this.resolveEvidence(
       milestone.frontmatter.evidenceLinks
     );

     return {
       milestone: parseMilestoneData(milestone),
       dependencies,
       evidence,
     };
   }
   ```

3. **Create Progress Calculator** (`src/lib/progress-calculator.ts`)

   **Functions**:
   - `calculateOutcomeProgress(milestones[])` - Average of milestone progress
   - `resolveDependencyGraph(milestones[])` - Build DAG structure
   - `detectCircularDependencies(dependencies)` - Validation

   **Example**:

   ```typescript
   export function calculateOutcomeProgress(
     milestones: MilestoneWithData[],
   ): number {
     if (milestones.length === 0) return 0;

     const totalProgress = milestones.reduce(
       (sum, m) => sum + m.frontmatter.progress,
       0,
     );

     return Math.round(totalProgress / milestones.length);
   }

   export function detectCircularDependencies(
     milestones: Map<string, string[]>,
   ): string[] {
     // DFS-based cycle detection
     // Returns array of milestone IDs in cycle, or empty if none
   }
   ```

4. **Register DataSources**

   ```typescript
   // In plugin.ts onRegister()
   const outcomeDS = new OutcomeDataSource(context.entityService, logger);
   const milestoneDS = new MilestoneDataSource(context.entityService, logger);

   context.registerDataSource(outcomeDS);
   context.registerDataSource(milestoneDS);
   ```

**Reference Files**:

- `plugins/blog/src/datasources/blog-datasource.ts` (datasource patterns)
- `plugins/topics/src/datasources/topics-datasource.ts` (relationship queries)

---

### Phase 3: UI Templates

**Goal**: Create templates for browsing and viewing outcomes/milestones

**Tasks**:

1. **Create Outcome List Template** (`src/templates/outcome-list/`)

   **Files**: `layout.tsx`, `schema.ts`

   **Schema**:

   ```typescript
   export const outcomeListDataSchema = z.object({
     outcomes: z.array(outcomeWithDataSchema),
     totalCount: z.number(),
   });
   ```

   **Layout**:

   ```typescript
   import { ListPageHeader, Card, CardTitle, CardMetadata, StatBadge } from "@brains/ui-library";

   export const OutcomeListLayout = ({ outcomes, totalCount }) => {
     return (
       <div className="max-w-4xl mx-auto p-6">
         <ListPageHeader
           title="Outcomes"
           count={totalCount}
           singularLabel="outcome"
         />

         <div className="space-y-6">
           {outcomes.map(outcome => (
             <Card key={outcome.id} variant="vertical">
               <CardTitle href={`/outcomes/${outcome.id}`}>
                 {outcome.frontmatter.title}
               </CardTitle>

               <p className="text-theme-muted mb-4">
                 {outcome.frontmatter.description}
               </p>

               <CardMetadata>
                 <StatBadge count={outcome.milestoneCount} label="milestones" />
                 <span className={`status-${outcome.frontmatter.status}`}>
                   {outcome.frontmatter.status}
                 </span>
               </CardMetadata>
             </Card>
           ))}
         </div>
       </div>
     );
   };
   ```

2. **Create Outcome Detail Template** (`src/templates/outcome-detail/`)

   **Schema**:

   ```typescript
   export const outcomeDetailDataSchema = z.object({
     outcome: outcomeWithDataSchema,
     milestones: z.array(milestoneWithDataSchema),
     overallProgress: z.number(),
   });
   ```

   **Layout**:

   ```typescript
   import { DetailPageHeader, StatBadge, EntryCard } from "@brains/ui-library";

   export const OutcomeDetailLayout = ({ outcome, milestones, overallProgress }) => {
     return (
       <div className="max-w-4xl mx-auto p-6">
         <DetailPageHeader
           title={outcome.frontmatter.title}
           created={outcome.created}
           updated={outcome.updated}
           summary={outcome.frontmatter.description}
         />

         <div className="mb-8">
           <ProgressBar value={overallProgress} />
           <div className="flex gap-4 mt-4">
             <StatBadge count={milestones.length} label="milestones" />
             <StatBadge
               count={milestones.filter(m => m.frontmatter.status === "completed").length}
               label="completed"
             />
           </div>
         </div>

         <div className="prose max-w-none mb-8">
           {outcome.body}
         </div>

         <h2 className="text-2xl font-bold mb-4">Milestones</h2>
         <div className="space-y-4">
           {milestones.map(milestone => (
             <MilestoneCard key={milestone.id} milestone={milestone} />
           ))}
         </div>
       </div>
     );
   };
   ```

3. **Create Milestone Detail Template** (`src/templates/milestone-detail/`)

   **Schema**:

   ```typescript
   export const milestoneDetailDataSchema = z.object({
     milestone: milestoneWithDataSchema,
     outcome: outcomeWithDataSchema,
     dependencies: z.array(milestoneWithDataSchema),
     evidence: z.array(z.any()), // Mixed entity types
   });
   ```

   **Layout**:

   ```typescript
   import { DetailPageHeader, SourceReferenceCard, BackLink } from "@brains/ui-library";

   export const MilestoneDetailLayout = ({ milestone, outcome, dependencies, evidence }) => {
     return (
       <div className="max-w-4xl mx-auto p-6">
         <DetailPageHeader
           title={milestone.frontmatter.title}
           created={milestone.created}
           updated={milestone.updated}
         />

         <div className="mb-6">
           <ProgressBar value={milestone.frontmatter.progress} />
           <p className="text-sm text-theme-muted mt-2">
             Part of: <a href={`/outcomes/${outcome.id}`}>{outcome.frontmatter.title}</a>
           </p>
         </div>

         {dependencies.length > 0 && (
           <section className="mb-8">
             <h2 className="text-xl font-semibold mb-3">Dependencies</h2>
             <div className="space-y-3">
               {dependencies.map(dep => (
                 <SourceReferenceCard
                   key={dep.id}
                   id={dep.id}
                   title={dep.frontmatter.title}
                   type="milestone"
                   href={`/milestones/${dep.id}`}
                 />
               ))}
             </div>
           </section>
         )}

         {evidence.length > 0 && (
           <section className="mb-8">
             <h2 className="text-xl font-semibold mb-3">Evidence</h2>
             <div className="space-y-3">
               {evidence.map(item => (
                 <SourceReferenceCard
                   key={item.id}
                   id={item.id}
                   title={item.title}
                   type={item.entityType}
                   href={`/${item.entityType}s/${item.id}`}
                 />
               ))}
             </div>
           </section>
         )}

         <BackLink href={`/outcomes/${outcome.id}`}>
           Back to {outcome.frontmatter.title}
         </BackLink>
       </div>
     );
   };
   ```

4. **Create Roadmap View Template** (`src/templates/roadmap-view/`)

   **Layout**: Kanban-style board grouped by status

   ```typescript
   export const RoadmapViewLayout = ({ outcomes, stats }) => {
     const grouped = groupBy(outcomes, o => o.frontmatter.status);

     return (
       <div className="roadmap-view p-6">
         <h1 className="text-3xl font-bold mb-6">Roadmap Overview</h1>

         <div className="grid grid-cols-4 gap-4 mb-8">
           {Object.entries(stats).map(([status, count]) => (
             <StatBox key={status} title={status} count={count} />
           ))}
         </div>

         <div className="grid grid-cols-4 gap-6">
           {["planning", "in-progress", "achieved", "archived"].map(status => (
             <div key={status} className="column">
               <h2 className="text-xl font-semibold mb-4 capitalize">{status}</h2>
               <div className="space-y-3">
                 {grouped[status]?.map(outcome => (
                   <OutcomeCard key={outcome.id} outcome={outcome} compact />
                 ))}
               </div>
             </div>
           ))}
         </div>
       </div>
     );
   };
   ```

5. **Create UI Components** (`src/templates/components/`)
   - `ProgressBar.tsx` - Visual progress indicator
   - `StatusBadge.tsx` - Colored status pills
   - `MilestoneCard.tsx` - Compact milestone display
   - `OutcomeCard.tsx` - Compact outcome display

6. **Register Templates**
   ```typescript
   // In plugin.ts
   const templates = {
     "outcome-list": createTemplate({
       name: "outcome-list",
       schema: outcomeListDataSchema,
       dataSourceId: "roadmap:outcomes",
       layout: { component: OutcomeListLayout, interactive: false },
     }),
     "outcome-detail": createTemplate({
       name: "outcome-detail",
       schema: outcomeDetailDataSchema,
       dataSourceId: "roadmap:outcomes",
       layout: { component: OutcomeDetailLayout, interactive: false },
     }),
     // ... more templates
   };
   ```

**Reference Files**:

- `plugins/blog/src/templates/blog-list.tsx` (list template)
- `plugins/blog/src/templates/blog-post.tsx` (detail template)
- `plugins/topics/src/templates/topic-detail/layout.tsx` (SourceReferenceCard usage)

---

### Phase 4: Tools & Commands

**Goal**: Create MCP tools and CLI commands for interaction

**Tasks**:

1. **Create Outcome Tools** (`src/tools/create-outcome.ts`)

   **Pattern**: Follow `plugins/blog/src/tools/generate.ts`

   ```typescript
   export function createOutcomeTool(context, pluginId): PluginTool {
     return {
       name: `${pluginId}:create-outcome`,
       description: "Create a new outcome/goal",
       inputSchema: z.object({
         title: z.string(),
         description: z.string(),
         type: z.enum(["business", "personal", "research"]),
         priority: z.enum(["low", "medium", "high", "critical"]).optional(),
       }).shape,
       handler: async (input) => {
         const outcome = await context.entityService.createEntity({
           entityType: "outcome",
           content: generateOutcomeMarkdown(input),
           metadata: {
             title: input.title,
             type: input.type,
             status: "planning",
             priority: input.priority,
           },
         });

         return {
           success: true,
           data: { outcomeId: outcome.id },
           message: `Outcome created: ${outcome.id}`,
         };
       },
     };
   }
   ```

2. **Create Milestone Tools** (`src/tools/`)
   - `create-milestone.ts` - Create milestone for outcome
   - `update-progress.ts` - Update milestone progress
   - `add-dependency.ts` - Add milestone dependency
   - `link-evidence.ts` - Link evidence to milestone

   **Example** (`link-evidence.ts`):

   ```typescript
   export function createLinkEvidenceTool(context, pluginId): PluginTool {
     return {
       name: `${pluginId}:link-evidence`,
       description: "Link evidence (summary/post/topic) to a milestone",
       inputSchema: z.object({
         milestoneId: z.string(),
         evidenceType: z.enum(["summary", "post", "topic", "link", "deck"]),
         evidenceId: z.string(),
         note: z.string().optional(),
       }).shape,
       handler: async (input) => {
         const milestone = await context.entityService.getEntity(
           "milestone",
           input.milestoneId,
         );

         // Fetch evidence entity to get title
         const evidence = await context.entityService.getEntity(
           input.evidenceType,
           input.evidenceId,
         );

         // Parse current frontmatter
         const parsed = parseMilestoneFrontmatter(milestone.content);

         // Add evidence link
         parsed.evidenceLinks.push({
           type: input.evidenceType,
           id: input.evidenceId,
           title: evidence.metadata.title,
           note: input.note,
         });

         // Update entity
         await context.entityService.updateEntity(
           "milestone",
           input.milestoneId,
           { content: generateMilestoneMarkdown(parsed) },
         );

         return {
           success: true,
           message: "Evidence linked successfully",
         };
       },
     };
   }
   ```

3. **Create Commands** (`src/commands/index.ts`)

   ```typescript
   export function createRoadmapCommands(context, pluginId): Command[] {
     return [
       {
         name: "outcome-create",
         description: "Create a new outcome interactively",
         usage: "/outcome-create",
         handler: async (args, commandContext) => {
           // Interactive prompts for title, description, type, priority
           // Call create-outcome tool
         },
       },
       {
         name: "milestone-add",
         description: "Add milestone to an outcome",
         usage: "/milestone-add <outcomeId> <title>",
         handler: async (args) => {
           // Parse args, call create-milestone tool
         },
       },
       {
         name: "progress-update",
         description: "Update milestone progress",
         usage: "/progress-update <milestoneId> <0-100>",
         handler: async (args) => {
           // Parse args, call update-progress tool
         },
       },
     ];
   }
   ```

4. **Register Tools and Commands**

   ```typescript
   // In plugin.ts
   public getTools(): PluginTool[] {
     return [
       createOutcomeTool(this.context, this.id),
       createMilestoneTool(this.context, this.id),
       updateProgressTool(this.context, this.id),
       linkEvidenceTool(this.context, this.id),
       addDependencyTool(this.context, this.id),
     ];
   }

   public getCommands(): Command[] {
     return createRoadmapCommands(this.context, this.id);
   }
   ```

**Reference Files**:

- `plugins/blog/src/tools/generate.ts` (tool patterns)
- `plugins/blog/src/commands/index.ts` (command patterns)

---

### Phase 5: Integration & Polish

**Goal**: Wire up navigation, routes, and cross-plugin integration

**Tasks**:

1. **Register Routes and Navigation**

   ```typescript
   // In plugin.ts
   public getRoutes(): RouteDefinition[] {
     return [
       {
         id: "outcome-list",
         path: "/outcomes",
         title: "Outcomes",
         template: "outcome-list",
         navigation: {
           show: true,
           label: "Roadmap",
           slot: "primary",
           priority: 50,
         },
       },
       {
         id: "outcome-detail",
         path: "/outcomes/:id",
         title: "Outcome Detail",
         template: "outcome-detail",
       },
       {
         id: "roadmap-view",
         path: "/roadmap",
         title: "Roadmap View",
         template: "roadmap-view",
       },
     ];
   }
   ```

2. **Evidence Resolution Helper**

   ```typescript
   // In src/lib/evidence-resolver.ts
   export async function resolveEvidence(
     evidenceLinks: EvidenceLink[],
     entityService: EntityService,
   ): Promise<Array<{ id: string; title: string; entityType: string }>> {
     return Promise.all(
       evidenceLinks.map(async (link) => {
         try {
           const entity = await entityService.getEntity(link.type, link.id);
           return {
             id: entity.id,
             title: entity.metadata.title || link.title,
             entityType: link.type,
           };
         } catch (error) {
           // Entity deleted/missing - return cached data
           return {
             id: link.id,
             title: `${link.title} (unavailable)`,
             entityType: link.type,
           };
         }
       }),
     );
   }
   ```

3. **Search Integration**
   - Outcomes are automatically searchable (content + embeddings)
   - Metadata filters for type, status, priority
   - Tag-based filtering

4. **RSS Feed (Optional)**

   ```typescript
   // In src/datasources/outcome-rss-datasource.ts
   export class OutcomeRSSDataSource {
     async fetch(query): Promise<string> {
       const outcomes = await this.entityService.listEntities("outcome", {
         filter: { metadata: { status: "achieved" } },
         limit: 50,
       });

       return generateRSS({
         title: "Outcomes Feed",
         items: outcomes.map((o) => ({
           title: o.metadata.title,
           link: `/outcomes/${o.id}`,
           pubDate: o.metadata.achievedAt || o.updated,
         })),
       });
     }
   }
   ```

**Reference Files**:

- `plugins/site-builder/src/lib/dynamic-route-generator.ts` (routing)
- `plugins/blog/src/datasources/rss-datasource.ts` (RSS pattern)

---

### Phase 6: Testing & Documentation

**Goal**: Comprehensive testing and documentation

**Tasks**:

1. **Unit Tests** (`test/`)

   **Schema Tests** (`schemas.test.ts`):

   ```typescript
   describe("Outcome Schema", () => {
     it("should validate valid outcome", () => {
       const valid = {
         title: "Launch Product",
         description: "Ship v1.0",
         type: "business",
         status: "planning",
         tags: ["product", "launch"],
       };
       expect(() => outcomeFrontmatterSchema.parse(valid)).not.toThrow();
     });

     it("should reject invalid status", () => {
       const invalid = { ...valid, status: "invalid" };
       expect(() => outcomeFrontmatterSchema.parse(invalid)).toThrow();
     });
   });
   ```

   **Adapter Tests** (`adapters.test.ts`):

   ```typescript
   describe("OutcomeAdapter", () => {
     it("should roundtrip toMarkdown -> fromMarkdown", () => {
       const entity = createMockOutcome();
       const markdown = adapter.toMarkdown(entity);
       const parsed = adapter.fromMarkdown(markdown);

       expect(parsed.metadata.title).toBe(entity.metadata.title);
       expect(parsed.metadata.status).toBe(entity.metadata.status);
     });
   });
   ```

   **Progress Calculator Tests** (`progress-calculator.test.ts`):

   ```typescript
   describe("calculateOutcomeProgress", () => {
     it("should average milestone progress", () => {
       const milestones = [
         createMilestone({ progress: 50 }),
         createMilestone({ progress: 100 }),
         createMilestone({ progress: 0 }),
       ];

       expect(calculateOutcomeProgress(milestones)).toBe(50);
     });

     it("should detect circular dependencies", () => {
       const deps = new Map([
         ["m1", ["m2"]],
         ["m2", ["m3"]],
         ["m3", ["m1"]], // Cycle!
       ]);

       const cycle = detectCircularDependencies(deps);
       expect(cycle).toEqual(["m1", "m2", "m3"]);
     });
   });
   ```

   **DataSource Tests** (`datasources.test.ts`):

   ```typescript
   describe("OutcomeDataSource", () => {
     it("should fetch outcome with milestones", async () => {
       const result = await datasource.fetchSingleOutcome("outcome-1");

       expect(result.outcome.id).toBe("outcome-1");
       expect(result.milestones).toHaveLength(3);
       expect(result.overallProgress).toBeGreaterThan(0);
     });
   });
   ```

2. **Integration Tests**
   - Create outcome → add milestones → link evidence → complete
   - Dependency validation flow
   - Evidence linking with missing entities

3. **Documentation**

   **README.md**:

   ```markdown
   # Roadmap Plugin

   Outcome-based goal tracking with milestone management.

   ## Features

   - Flexible outcomes (business/personal/research)
   - Milestone-based progress tracking
   - Evidence linking to conversations
   - Dependency management

   ## Usage

   ### Create an Outcome

   \`\`\`
   /outcome-create
   \`\`\`

   ### Add Milestones

   \`\`\`
   /milestone-add <outcomeId> "Milestone title"
   \`\`\`

   ### Link Evidence

   \`\`\`typescript
   await mcpClient.call("roadmap:link-evidence", {
   milestoneId: "m1",
   evidenceType: "summary",
   evidenceId: "sum-123",
   note: "Discussed implementation approach"
   });
   \`\`\`
   ```

   **Schema Documentation**:
   - Document all frontmatter fields
   - Provide examples for each entity type
   - Explain relationship patterns

**Reference Files**:

- `plugins/blog/test/plugin.test.ts` (plugin tests)
- `plugins/identity-service/test/adapter.test.ts` (adapter tests)

---

## File Structure

```
plugins/roadmap/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                       # Export RoadmapPlugin
│   ├── plugin.ts                      # Main plugin class
│   ├── config.ts                      # Configuration schema
│   │
│   ├── schemas/
│   │   ├── outcome.ts                 # Outcome entity schemas
│   │   └── milestone.ts               # Milestone entity schemas
│   │
│   ├── adapters/
│   │   ├── outcome-adapter.ts         # Outcome markdown adapter
│   │   └── milestone-adapter.ts       # Milestone markdown adapter
│   │
│   ├── datasources/
│   │   ├── outcome-datasource.ts      # Outcome queries
│   │   └── milestone-datasource.ts    # Milestone queries
│   │
│   ├── templates/
│   │   ├── outcome-list/
│   │   │   ├── layout.tsx
│   │   │   └── schema.ts
│   │   ├── outcome-detail/
│   │   │   ├── layout.tsx
│   │   │   └── schema.ts
│   │   ├── milestone-detail/
│   │   │   ├── layout.tsx
│   │   │   └── schema.ts
│   │   ├── roadmap-view/
│   │   │   ├── layout.tsx
│   │   │   └── schema.ts
│   │   └── components/
│   │       ├── ProgressBar.tsx
│   │       ├── StatusBadge.tsx
│   │       ├── MilestoneCard.tsx
│   │       └── OutcomeCard.tsx
│   │
│   ├── tools/
│   │   ├── create-outcome.ts
│   │   ├── create-milestone.ts
│   │   ├── update-progress.ts
│   │   ├── link-evidence.ts
│   │   └── add-dependency.ts
│   │
│   ├── commands/
│   │   └── index.ts                   # CLI commands
│   │
│   └── lib/
│       ├── progress-calculator.ts     # Progress/dependency logic
│       └── evidence-resolver.ts       # Evidence linking helper
│
└── test/
    ├── schemas.test.ts
    ├── adapters.test.ts
    ├── progress-calculator.test.ts
    └── datasources.test.ts
```

## Key Reference Files from Codebase

### Critical Patterns to Follow

**Entity Schemas**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/schemas/blog-post.ts`
- `/home/yeehaa/Documents/brains/plugins/topics/src/schemas/topic.ts`

**Adapters**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/adapters/blog-post-adapter.ts`
- `/home/yeehaa/Documents/brains/plugins/summary/src/adapters/summary-adapter.ts`

**DataSources**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/datasources/blog-datasource.ts`
- `/home/yeehaa/Documents/brains/plugins/topics/src/datasources/topics-datasource.ts`

**Templates**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/templates/blog-list.tsx`
- `/home/yeehaa/Documents/brains/plugins/topics/src/templates/topic-detail/layout.tsx`

**Tools**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/tools/generate.ts`

**Plugin Main**:

- `/home/yeehaa/Documents/brains/plugins/blog/src/plugin.ts` (complex)
- `/home/yeehaa/Documents/brains/plugins/decks/src/plugin.ts` (simple)

## Implementation Timeline

**Week 1: Foundation**

- Phase 1 (Core Entity System)
- Plugin structure, schemas, adapters
- Entity registration

**Week 2: Data Layer**

- Phase 2 (Data Layer)
- Datasources, queries, progress calculation
- Relationship resolution

**Week 3: UI**

- Phase 3 (UI Templates)
- List/detail templates
- UI components (ProgressBar, StatusBadge, etc.)

**Week 4: Interaction**

- Phase 4 (Tools & Commands)
- MCP tools for creation/updates
- CLI commands

**Week 5: Integration & Testing**

- Phase 5 (Integration)
- Phase 6 (Testing)
- Navigation, routes, evidence linking
- Comprehensive tests and documentation

## Success Criteria

✓ Can create outcomes with different types (business/personal/research)
✓ Can add milestones to outcomes
✓ Milestone progress tracked (0-100%)
✓ Can link evidence from summaries/posts/topics to milestones
✓ Can define dependencies between milestones
✓ Circular dependency detection works
✓ Progress automatically calculates from milestone completion
✓ Roadmap view shows all outcomes grouped by status
✓ Evidence links resolve to actual entities
✓ Missing/deleted evidence handled gracefully (shows cached title)
✓ All unit tests pass
✓ Outcomes searchable via vector search and metadata filters
✓ Integrated into site navigation
✓ RSS feed for achieved outcomes (optional)
✓ Documentation complete with examples

## Design Decisions Rationale

### Why Milestone-Based vs Task-Based?

**Milestones** focus on meaningful checkpoints rather than granular tasks:

- Better for tracking progress toward outcomes
- Encourages thinking about evidence and results
- More flexible for timeline-agnostic work
- Natural fit for linking conversations as progress evidence

### Why Store Evidence as Rich Objects?

```typescript
{
  (type, id, title, note);
}
```

**Benefits**:

- Cached title avoids constant lookups
- Handles deleted entities gracefully
- Note field adds context
- Type field enables proper routing

**Trade-off**: Titles can become stale, but improves UX

### Why Timeline-Agnostic?

**Rationale**:

- Many goals don't have strict deadlines
- Dependencies matter more than dates
- Status-based flow matches reality better
- Optional targetDate for when it matters

### Why Two Entity Types?

**Outcome** = High-level goal
**Milestone** = Concrete checkpoint

**Benefits**:

- Clear separation of concerns
- Easy to query milestones by outcome
- Natural progress aggregation
- Flexible milestone reuse across outcomes (if needed)

## Future Enhancements

**Nice-to-Have Features** (not in initial implementation):

1. **Outcome Templates** - Pre-defined milestone structures for common outcome types
2. **Progress Visualization** - Gantt chart or timeline view
3. **Milestone Auto-completion** - AI-suggested milestones based on outcome description
4. **Evidence Auto-linking** - Automatically suggest conversations as evidence
5. **Outcome Relationships** - Parent/child outcome hierarchies
6. **Team Outcomes** - Shared outcomes across multiple brains (if collaborative)
7. **Notifications** - Alerts for blocked milestones or approaching targets
8. **Export to Project Management Tools** - Sync with Jira, Linear, etc.

---

## Notes

This plugin represents a shift from task-oriented productivity to outcome-oriented achievement tracking. The focus on evidence linking transforms your Personal Brain from a knowledge repository into a tool that actively tracks how your learnings and conversations contribute to your goals.

The timeline-agnostic, milestone-based approach better matches how creative and knowledge work actually happens - progress is often non-linear, and proof of progress comes from artifacts (conversations, posts, research) rather than checkboxes.
