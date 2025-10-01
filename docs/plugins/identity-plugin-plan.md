# Identity Feature Implementation Plan

## Overview

Implement Identity as a **core Shell feature** that defines the brain's **role, purpose, and values**, injecting this identity into all AI interactions to provide consistent, personalized responses aligned with the brain's character.

## Architecture Summary

**Core Shell Feature (Not a Plugin):**

- **IdentityEntity interface** - Defined in `shell/core/src/types/identity.ts`
- **IdentityAdapter** - Handles markdown serialization in `shell/core/src/adapters/identity-adapter.ts`
- **IdentityService** - Caches and provides identity in `shell/core/src/services/identity-service.ts`
- **Shell integration** - Registers entity type, creates default, injects into AI calls
- **System Plugin** - Provides `/identity` view command

## Design Decisions

### 1. Core Feature vs Plugin

**Decision**: Core Shell feature (not a plugin)

**Rationale:**

- Identity is fundamental - injected into all AI operations
- Avoids circular dependency (core cannot depend on plugins)
- Always available, not optional
- Simpler architecture
- Type definitions live in core where Shell can access them

### 2. Storage Strategy

**Decision**: Stored as database entity (can evolve over time)

- Identity can be queried and updated
- Participates in sync/backup workflows
- Allows identity to evolve with the brain

### 3. Singleton Pattern

**Decision**: One identity per brain

- Fixed ID: `"system:identity"`
- Easy to retrieve: `entityService.getEntity("identity", "system:identity")`
- Clear, unambiguous identity for each brain

### 4. Identity Fields

**Decision**: Three core fields

- **role**: Single line describing what the brain is (e.g., "personal knowledge assistant")
- **purpose**: Paragraph explaining why it exists and what it helps with
- **values**: Array of key principles that guide behavior (e.g., `["clarity", "accuracy", "helpfulness"]`)

Rationale: These three fields cover 80% of identity needs. Can extend later if needed.

### 5. Injection Scope

**Decision**: Injected into ALL AI operations

- Link extraction considers the brain's role/purpose
- Topic extraction aligns with values
- Summaries are framed according to purpose
- User queries benefit from full identity context

Rationale: Identity is more than personality - role and purpose directly affect how ALL operations should be performed.

### 6. Injection Strategy

**Decision**: Shell-level injection (in generateContent method)

- Templates can access and format identity appropriately for their use case
- More flexible: Different templates can use identity differently
- Observable: Identity is part of the data flow, easier to debug/test
- Extensible: Plugins can override or extend how identity is used
- Follows existing patterns: Uses the template/data system already in place

### 7. Identity ID

**Decision**: Fixed ID `"system:identity"`

- Makes singleton retrieval trivial
- No need to query/search
- Clear, predictable identifier

### 8. Management Interface

**Decision**: View command only, updates through entity operations

- `/identity` command to view current identity
- Updates via standard entity operations or file editing
- Participates in normal entity workflows

### 9. Default Identity

**Decision**: Plugin creates default programmatically if missing

- Ensures every brain has an identity from the start
- No dependency on directory-sync plugin
- Seed content available for documentation/reference

### 10. Performance

**Decision**: Shell caches identity with update invalidation

- Identity cached in memory on Shell init
- Listens to `entity:updated` events to refresh cache
- Avoids database lookup on every AI call
- Read-heavy access pattern (rarely changes, frequently read)

### 11. Seed Content

**Decision**: Programmatic creation, no seed content files

**Rationale:**

- No dependency on directory-sync plugin
- Guaranteed consistency - code ensures structure is correct
- Simpler - no files to maintain across multiple apps
- Users can still edit - becomes normal entity file after creation

### 12. Entity Adapter

**Decision**: Custom IdentityAdapter in shell/core

**Rationale:**

- Identity has specific fields (role, purpose, values) that need frontmatter
- BaseEntityAdapter doesn't handle custom frontmatter fields
- Need proper markdown serialization/deserialization

### 13. Command Output Format

**Decision**: Plain text format for `/identity` command

**Rationale:**

- Simple and readable - identity shown at a glance
- Consistent with other info commands
- Just 3 fields, doesn't need complex formatting

## Architecture Details

### Current AI Query Flow

1. User query → `Shell.query()` → `generateContent()`
2. Uses template: `shell:knowledge-query` with base prompt
3. Base prompt in `shell/content-service/src/templates/knowledge-query.ts`
4. Prompt passed to `AIService.generateText(systemPrompt, userPrompt)`

### Identity Integration Point

Identity is injected into the data context before template resolution, making it available to all templates via template variables.

## Implementation Steps

### 1. Define IdentityEntity Interface

**Location**: `shell/core/src/types/identity.ts`

```typescript
export interface IdentityEntity {
  id: "system:identity";
  entityType: "identity";
  role: string;
  purpose: string;
  values: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 2. Create IdentityAdapter

**Location**: `shell/core/src/adapters/identity-adapter.ts`

**Responsibilities:**

- Serialize identity to markdown with frontmatter
- Deserialize markdown to identity entity
- Handle role, purpose, and values fields

**Pattern**: Similar to LinkAdapter and TopicAdapter

### 3. Create Identity Schema

**Location**: `shell/core/src/schemas/identity.ts`

```typescript
import { z } from "@brains/utils";

export const identitySchema = z.object({
  id: z.literal("system:identity"),
  entityType: z.literal("identity"),
  role: z.string().describe("The brain's primary role"),
  purpose: z.string().describe("The brain's purpose and goals"),
  values: z.array(z.string()).describe("Core values that guide behavior"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

### 4. Create IdentityService

**Location**: `shell/core/src/services/identity-service.ts`

**Interface:**

```typescript
export class IdentityService {
  async initialize(): Promise<void>;
  async getIdentity(): Promise<IdentityEntity | null>;
  async refreshCache(): Promise<void>;
}
```

**Responsibilities:**

- Initialize and cache identity on startup
- Provide cached identity to Shell
- Refresh cache when identity entity updated
- Handle missing identity gracefully

### 5. Register Identity Entity Type in Shell

**Location**: `shell/core/src/initialization/shellInitializer.ts` (or similar init location)

**Add to initialization:**

```typescript
async registerCoreEntityTypes(entityService: IEntityService) {
  // Register identity entity type
  const identityAdapter = new IdentityAdapter();
  entityService.registerEntityType("identity", identitySchema, identityAdapter);

  this.logger.debug("Core entity types registered");
}
```

**Create default identity if missing:**

```typescript
async ensureDefaultIdentity(entityService: IEntityService) {
  const existing = await entityService.getEntity("identity", "system:identity");

  if (!existing) {
    this.logger.info("Creating default identity entity");
    await entityService.createEntity("identity", {
      id: "system:identity",
      role: "Personal knowledge assistant",
      purpose: "Help organize, understand, and retrieve information from your personal knowledge base.",
      values: ["clarity", "accuracy", "helpfulness"],
    });
  }
}
```

### 6. Integrate IdentityService into Shell

**Location**: `shell/core/src/shell.ts`

**Changes:**

- Add IdentityService as private field
- Initialize in `initialize()` method (after entity type registration)
- Subscribe to `entity:updated` events for identity refresh
- Inject identity into `generateContent()` method data context

**Implementation:**

```typescript
// In Shell class
private identityService: IdentityService;

async initialize() {
  // ... existing initialization

  // Register core entity types
  await shellInitializer.registerCoreEntityTypes(this.entityService);

  // Ensure default identity exists
  await shellInitializer.ensureDefaultIdentity(this.entityService);

  // Initialize identity service
  this.identityService = new IdentityService(
    this.entityService,
    this.logger
  );
  await this.identityService.initialize();

  // Subscribe to identity updates
  this.messageBus.subscribe("entity:updated", async (msg) => {
    if (msg.payload.entityType === "identity" &&
        msg.payload.entityId === "system:identity") {
      await this.identityService.refreshCache();
      this.logger.debug("Identity updated and cache refreshed");
    }
  });

  // ... rest of initialization
}

// Modify generateContent method
async generateContent<T>(...): Promise<T> {
  // Get identity and inject into data
  const identity = await this.identityService.getIdentity();
  const enhancedData = identity
    ? { ...data, identity }
    : data;

  // Continue with existing logic using enhancedData
  // ...
}
```

### 7. Add /identity Command to System Plugin

**Location**: `plugins/system/src/commands/index.ts`

**Add command:**

```typescript
{
  name: "identity",
  description: "View the brain's identity",
  usage: "/identity",
  handler: async (_args, context) => {
    const identity = await context.entityService.getEntity("identity", "system:identity");
    if (!identity) {
      return {
        type: "message",
        message: "❌ No identity configured"
      };
    }
    return {
      type: "message",
      message: `🧠 **Brain Identity**

**Role**: ${identity.role}

**Purpose**: ${identity.purpose}

**Values**: ${identity.values.join(", ")}`
    };
  }
}
```

### 8. Update Templates to Use Identity

**Location**: `shell/content-service/src/templates/knowledge-query.ts`

**Template Enhancement:**

```typescript
basePrompt: `{{#if identity}}You are {{identity.role}}.

Your purpose: {{identity.purpose}}

Your guiding values: {{identity.values}}

{{/if}}You are a personal knowledge assistant with access to the user's entities and data.
[... rest of prompt ...]`;
```

**Pattern for Other Templates:**
All templates can access identity via `{{identity.role}}`, `{{identity.purpose}}`, `{{identity.values}}` in their prompts.

## Customizing Identity

Since identity is stored as a normal entity file, users can customize it through:

1. **Direct file editing** (if using directory-sync):
   - Edit `brain-data/identity/system:identity.md`
   - Modify frontmatter fields: role, purpose, values
   - Changes sync to database automatically

2. **Entity update operations**:
   - Use entity service methods to update programmatically
   - Changes trigger cache refresh via `entity:updated` event

3. **Future UI** (potential enhancement):
   - Settings page to edit identity
   - Form-based editing with validation

## Example Use Cases

### Research Assistant Brain

```yaml
role: Academic research assistant
purpose: Help organize research papers, extract key insights, and maintain literature review notes. Support academic writing and citation management.
values:
  - academic rigor
  - citation accuracy
  - critical thinking
  - knowledge synthesis
```

**Effect**: Link extraction focuses on methodology, findings, citations. Topic extraction emphasizes academic concepts. Queries receive scholarly, well-referenced responses.

### Team Coordination Brain

```yaml
role: Team knowledge coordinator
purpose: Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization. Support collaboration and transparency.
values:
  - collaboration
  - transparency
  - accessibility
  - actionability
```

**Effect**: Content organized for team consumption. Summaries highlight action items and decisions. Links capture team-relevant context.

### Personal Knowledge Brain

```yaml
role: Personal knowledge assistant
purpose: Help organize, understand, and retrieve information from your personal knowledge base. Provide contextual insights and maintain continuity.
values:
  - clarity
  - accuracy
  - helpfulness
  - privacy
```

**Effect**: Personalized responses, context-aware insights, conversational style aligned with personal use.

## Testing Checklist

- [ ] IdentityService initializes and caches identity
- [ ] Default identity created on first run
- [ ] Identity injected into Shell.generateContent()
- [ ] Templates receive identity in data context
- [ ] `/identity` command displays current identity
- [ ] Updating identity entity refreshes cache
- [ ] Shell works gracefully when identity missing
- [ ] All AI operations include identity context
- [ ] Identity persists through directory-sync
- [ ] Identity included in git-sync backups

## Migration Notes

- Existing brains will get default identity on first start after update
- No database migration needed (new entity type)
- Backward compatible - Shell works without identity if plugin not loaded
- Identity entity can be customized immediately after creation

## Future Enhancements

Potential additions (not in initial implementation):

- **Personality**: Tone and communication style
- **Constraints**: Behavioral boundaries ("never make up information")
- **Context**: Specific domain knowledge or focus areas
- **Multiple personas**: Switch identity based on context (requires architectural changes)
- **Identity templates**: Pre-defined identities for common use cases
