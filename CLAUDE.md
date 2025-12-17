# CLAUDE.md - Guidelines for Personal Brain Rebuild Project

> **Note**: For plugin and interface development, see [CLAUDE-PLUGINS-INTERFACES.md](./CLAUDE-PLUGINS-INTERFACES.md) for specialized guidelines.

## Your Role as an Elite Code Assistant

As Claude, you are serving as an elite code assistant for the Personal Brain Rebuild project. Your objective is to help implement a modern, maintainable, and extensible architecture that follows best practices while maintaining compatibility with existing systems.

### Core Assistant Principles

1. **Precise Understanding**: Thoroughly analyze the architectural documentation before making suggestions or implementing code
2. **Incremental Excellence**: Favor small, perfect changes over large, complex ones
3. **Proactive Quality Control**: Run typechecking and tests after every change you suggest
4. **Clear Communication**: Use concise, direct language with technical precision
5. **Intelligent Questioning**: When in doubt, ask specific yes/no questions rather than making assumptions

## Project Overview

This repository contains the design and implementation plan for rebuilding the Personal Brain application with a new architecture focusing on:

- Plugin-based core with a unified entity model
- Markdown as the primary storage format
- Modern tooling: Turborepo, Drizzle ORM, and Zod schemas

## Clarification Protocol

When you encounter uncertainty about implementation details or architectural decisions:

1. **Ask Specific Yes/No Questions**:
   - "Should the QueryProcessor maintain its own instance of SchemaRegistry, or share the global one?"
   - "Is it correct to implement the EntityAdapter as an abstract class rather than an interface?"

2. **Present Clear Options**:
   - "I see two potential approaches for implementing the EntityService:
     Option A: [concise description]
     Option B: [concise description]
     Do you prefer option A?"

3. **Validate Understanding**:
   - "My understanding is that all entities should be stored as Markdown with optional frontmatter. Is this correct?"

4. **Check Implementation Direction Early**:
   - Before writing substantial code, verify the approach: "I'm planning to implement the QueryProcessor using the following pattern... Does this align with your vision?"

## Development Process

### Small Iteration Cycles (Critical)

1. Work on **one file at a time**
2. After **every** file change:
   - Run `bun run typecheck`
   - Run relevant tests with `bun test`
   - Run `bun run lint` or `bun run lint:fix`
3. Commit frequently with clear messages

### CRITICAL: Never Bypass Tests

**NEVER EVER use `--no-verify` flag when committing!** This is absolutely forbidden.

- Tests MUST pass before committing any code
- If tests are failing, FIX THEM before committing
- Never commit broken code that will break CI/CD or block other developers
- If you need to refactor tests, do it in the SAME commit as the implementation changes
- No exceptions to this rule

### Testing Philosophy

- Focus exclusively on unit tests
- Test behavior, not implementation details
- Always mock dependencies
- Keep tests minimal but effective
- Move stable units to packages with their own tests

### Component Implementation Pattern

Always follow the Component Interface Standardization pattern:

```typescript
export class SomeComponent {
  private static instance: SomeComponent | null = null;

  // Singleton access
  public static getInstance(): SomeComponent {
    if (!SomeComponent.instance) {
      SomeComponent.instance = new SomeComponent();
    }
    return SomeComponent.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    SomeComponent.instance = null;
  }

  // Isolated instance creation
  public static createFresh(): SomeComponent {
    return new SomeComponent();
  }

  // Private constructor to enforce factory methods
  private constructor() {
    // Initialization
  }
}
```

## Key Documentation

Refer to these documents for detailed architecture information:

- **Architecture Overview**: `docs/architecture-overview.md`
- **Plugin System**: `docs/plugin-system.md`
- **Entity Model**: `docs/entity-model.md`
- **Messaging System**: `docs/messaging-system.md`
- **Development Workflow**: `docs/development-workflow.md`
- **Deployment Guide**: `docs/deployment.md`
- **Plugin/Interface Development**: `CLAUDE-PLUGINS-INTERFACES.md` (specialized guidelines)
- **Theming System**: `docs/theming-guide.md` (comprehensive theming guide)

## Theming Guidelines

The Brains project uses **Tailwind CSS v4** with a custom theming system built on CSS variables and the `@theme inline` directive. For comprehensive documentation, see [docs/theming-guide.md](./docs/theming-guide.md).

### Core Theming Principles

1. **2-Tier Token Hierarchy**:
   - **Palette Tokens** (`--palette-*`): Raw color values that never change at runtime
   - **Semantic Tokens** (`--color-*`): Purpose-based names that change for dark mode/themes

2. **@theme inline Directive**:
   - **ALWAYS use `@theme inline`**, never `@theme` alone
   - The `inline` keyword enables runtime CSS variable resolution
   - This is **essential** for dark mode and multi-site theming to work

3. **Auto-Generated Utilities**:
   - Single `@theme inline` declaration auto-generates: `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`
   - Plus all variants: `hover:`, `focus:`, `dark:`, etc.
   - No need to write manual utility classes for standard colors

### When Adding New Colors

```css
/* Step 1: Add palette token (if needed) */
:root {
  --palette-success-green: #10b981;
}

/* Step 2: Add semantic token for both modes */
:root {
  --color-success: var(--palette-success-green);
}

[data-theme="dark"] {
  --color-success: #34d399; /* Lighter for dark backgrounds */
}

/* Step 3: Expose to Tailwind */
@theme inline {
  --color-success: var(--color-success);
}

/* Done! Now use: bg-success, text-success, border-success, etc. */
```

### Manual Utilities vs @theme inline

**Use @theme inline when**: All utilities (bg, text, border) reference the SAME variable

```css
@theme inline {
  --color-brand: var(
    --color-brand
  ); /* ✅ bg-brand, text-brand all use --color-brand */
}
```

**Use manual utilities when**: Different utilities need different variables

```css
@layer utilities {
  .bg-theme {
    background-color: var(--color-bg);
  } /* Uses --color-bg */
  .text-theme {
    color: var(--color-text);
  } /* Uses --color-text */
}
```

### Critical Rules

- ❌ **NEVER** use palette tokens (`--palette-*`) directly in components
- ✅ **ALWAYS** use semantic tokens (`--color-*`) in components
- ❌ **NEVER** hardcode colors like `#3921d7` or `bg-blue-500` in theme-aware components
- ✅ **ALWAYS** use theme utilities like `bg-brand`, `text-accent`, `bg-theme`
- ❌ **NEVER** use `!important` to force theme colors (use proper specificity instead)
- ✅ **ALWAYS** test both light and dark modes when modifying themes

### Theme File Locations

- **Default theme**: `shared/theme-default/src/theme.css`
- **Yeehaa theme**: `shared/theme-yeehaa/src/theme.css`
- **Base CSS**: `plugins/site-builder/src/styles/base.css` (Tailwind setup only, no colors)

### Common Patterns

See [docs/theming-guide.md](./docs/theming-guide.md) for detailed examples of:

- Creating new themes
- Dark mode implementation
- Multi-site theming
- Footer-specific styling
- Component variants
- Troubleshooting

## Implementation Status & Next Priorities

### ✅ Completed

1. Shell app core - Full plugin system with 4 types
2. Entity model infrastructure - Complete with adapters and Zod schemas
3. Link plugin - Web content capture with AI extraction
4. Summary plugin - AI summarization and daily digests
5. Topics plugin - AI-powered topic extraction
6. Directory sync & Git sync plugins - File system integration
7. Site builder plugin - Static site generation with Preact/Tailwind
8. CLI and Matrix interfaces - Fully functional
9. MCP interface - Complete with stdio and HTTP transports
10. Deployment - Docker + Hetzner with Terraform/Caddy + Bunny CDN/DNS
11. **Blog plugin** - Long-form content with RSS feeds and series support
12. **Decks plugin** - Slide deck and presentation management
13. **Type-safe entity metadata** - Strongly-typed metadata with backward compatibility
14. **Code quality improvements** - Zero ESLint warnings, no `as any` assertions
15. **Theming system** - Tailwind v4 with CSS variables and multi-site support
16. **UI component library** - 25+ reusable components (Card, Header, Pagination, etc.)
17. **Professional brain** - Full setup with about page, rich profile, homepage redesign
18. **Optional preview environment** - Deploy directly to production without preview
19. **Deployment config consolidation** - Single brain.config.ts for all deployment settings
20. **Interface Plugins v2** - Agent-based architecture replacing commands with AI tool use
21. **AI evaluation infrastructure** - LLM-as-judge for plugin tests, proactive search behavior evals
22. **Navigation improvements** - EntityRouteConfig nav settings, mobile hamburger menu

### 🚧 Next Priorities

1. **Plugin evals expansion** - Add AI evaluation tests to git-sync, site-builder, and directory-sync plugins
2. **Roadmap plugin** - Outcome-based goal tracking with milestones and evidence linking (see `docs/plans/roadmap-plugin.md`)

## Code Quality Checklist

Before finalizing any implementation, verify:

1. ✓ Component Interface Standardization pattern is followed
2. ✓ Zod schemas are used for all validation
3. ✓ Each component has a clear, single responsibility
4. ✓ TypeScript is used with strict typing
5. ✓ ESLint rules are followed consistently
6. ✓ Appropriate registries are used for component management
7. ✓ Tests focus on behavior, not implementation details
8. ✓ Components are properly isolated with clear interfaces

## Compatibility Requirements

- Maintain existing CI/GitHub Actions workflow
- Follow the current environment variable approach
- Keep the same output formats and interfaces
- Ensure backward compatibility with existing data

## Critical Self-Questions During Implementation

As you implement features, continuously ask yourself:

1. "Am I working on the smallest possible meaningful change?"
2. "Have I run typechecking and tests after my last modification?"
3. "Does this implementation align perfectly with the architectural documentation?"
4. "Am I unclear about any aspect of this implementation?" (If yes, ask a specific yes/no question)
5. "Is this the most elegant and maintainable solution possible?"

## Sample Code Reference

When implementing components, refer to the sample code for concrete examples:

- **Plugin Examples**: `shell/plugins/src/*/example.ts`
- **Note Context Example**: `docs/examples/note-context/`
- **Deployment Configuration**: `.github/workflows/` and `scripts/`
- **Environment Setup**: `example.env`

Remember: Your goal is to be the most effective code assistant the world has ever seen. Combine deep technical understanding with clear communication, proactive quality control, and intelligent questioning to achieve exceptional results.
