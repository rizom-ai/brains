# Identity Plugin Implementation Plan

## Overview

Create an Identity plugin that defines the brain's **role, purpose, and values**, injecting this identity into all AI interactions to provide consistent, personalized responses aligned with the brain's character.

## Architecture Summary

**Core Service + Plugin Pattern:**
- **IdentityService** (core shell service) - Caches and provides identity to Shell
- **Identity Plugin** - Manages entity type, ensures default exists, provides view command

## Design Decisions

### 1. Plugin vs App-Level Config
**Decision**: Plugin-based (not app-level config)
- Can provide seed content for defaults
- Follows modular architecture pattern
- Optional but recommended for all brains

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

## Architecture Details

### Current AI Query Flow
1. User query → `Shell.query()` → `generateContent()`
2. Uses template: `shell:knowledge-query` with base prompt
3. Base prompt in `shell/content-service/src/templates/knowledge-query.ts`
4. Prompt passed to `AIService.generateText(systemPrompt, userPrompt)`

### Identity Integration Point
Identity is injected into the data context before template resolution, making it available to all templates via template variables.

## Implementation Steps

### 1. Create IdentityService (Shell Core)
**Location**: `shell/identity-service/`

**Interface:**
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

### 2. Integrate IdentityService into Shell
**Location**: `shell/core/src/shell.ts`

**Changes:**
- Add IdentityService as private field
- Initialize in `initialize()` method
- Subscribe to `entity:updated` events for identity refresh
- Inject identity into `generateContent()` method data context

**Implementation:**
```typescript
// In Shell class
private identityService: IdentityService;

async initialize() {
  // ... existing initialization

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

### 3. Create Identity Plugin
**Location**: `plugins/identity/`

**Package Structure:**
```
plugins/identity/
├── src/
│   ├── plugin.ts                 # Main plugin class
│   ├── schemas/
│   │   └── identity.ts           # Entity schema
│   ├── adapters/
│   │   └── identity-adapter.ts   # Entity adapter
│   └── commands/
│       └── index.ts              # View command
├── seed-content/
│   └── identity/
│       └── system:identity.md    # Default identity
├── test/
│   └── plugin.test.ts
├── package.json
└── tsconfig.json
```

**Plugin Responsibilities:**
- Register identity entity type with schema and adapter
- Ensure default identity exists (create if missing)
- Provide `/identity` view command
- Provide seed content for documentation

**Default Identity:**
```typescript
{
  id: "system:identity",
  role: "Personal knowledge assistant",
  purpose: "Help organize, understand, and retrieve information from your personal knowledge base.",
  values: ["clarity", "accuracy", "helpfulness"]
}
```

### 4. Update Templates to Use Identity
**Location**: `shell/content-service/src/templates/knowledge-query.ts`

**Template Enhancement:**
```typescript
basePrompt: `{{#if identity}}You are {{identity.role}}.

Your purpose: {{identity.purpose}}

Your guiding values: {{identity.values}}

{{/if}}You are a personal knowledge assistant with access to the user's entities and data.
[... rest of prompt ...]`
```

**Pattern for Other Templates:**
All templates can access identity via `{{identity.role}}`, `{{identity.purpose}}`, `{{identity.values}}` in their prompts.

### 5. Register Plugin in Brain Configs
**Location**: `apps/test-brain/brain.config.ts` and `apps/team-brain/brain.config.ts`

```typescript
import { IdentityPlugin } from "@brains/identity";

plugins: [
  new SystemPlugin({}),
  new IdentityPlugin(), // Add near the top
  new TopicsPlugin({}),
  // ... rest
]
```

### 6. Seed Content Structure
**Location**: `plugins/identity/seed-content/identity/system:identity.md`

```markdown
---
id: system:identity
entityType: identity
role: Personal knowledge assistant
purpose: Help organize, understand, and retrieve information from your personal knowledge base. Provide contextual insights and maintain continuity across conversations.
values:
  - clarity
  - accuracy
  - helpfulness
  - respect for privacy
---

# Brain Identity

This entity defines the identity of your brain - who it is, what it does, and the values that guide its behavior.

## Customizing Your Identity

Edit this file to customize your brain's identity:
- **Role**: What is your brain? (e.g., "Research assistant", "Team coordinator")
- **Purpose**: What does it help you achieve?
- **Values**: What principles guide its behavior?

The identity is automatically injected into all AI interactions to ensure consistent, personalized responses.
```

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
