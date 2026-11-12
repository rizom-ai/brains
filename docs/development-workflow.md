# Development Workflow

This document outlines the development workflow and best practices for the Brains project.

## Development Setup

### Prerequisites

- **Bun**: Version 1.4.0 or later
- **Node.js**: Version 24.18+ (repository tooling; application runtime remains Bun)
- **Git**: For version control
- **SQLite**: Included with most systems

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/rizom-ai/brains.git
cd brains

# Install dependencies
bun install

# Run any brain instance from its instance directory.
# Instances are brain.yaml-centered packages consumed by the brain CLI at runtime.
# `brain init` scaffolds a `.env.example` into the brain directory; copy it to
# `.env` and fill in your keys.
cd ~/Documents/yeehaa-io
cp .env.example .env   # then edit .env and add OPENAI_API_KEY at minimum
bunx brain start

# During framework development you can still run the in-tree CLI from another instance dir.
```

### Development Tools

Recommended VS Code extensions:

- **ESLint**: For linting support
- **Prettier**: For code formatting
- **Bun for Visual Studio Code**: Bun runtime support
- **TypeScript and JavaScript**: Enhanced language support

### Monorepo Commands

```bash
# Typecheck everything
bun run typecheck

# Run all tests
bun run test

# Run tests for a specific package or file
bun test shell/core/test/

# Lint everything
bun run lint

# Check markdown link health
bun run docs:links
```

## Iteration Cycles

The project follows a small, incremental iteration cycle approach to ensure quality and maintain stability.

### Small, Focused Changes

- Work on one small, focused change at a time
- Avoid creating or modifying multiple files in a single change
- Each change should represent a logical unit of functionality
- Keep code changes small and focused for easier review and testing

### Continuous Quality Checks

After **every** file change:

1. Run typechecking: `bun run typecheck`
2. Run relevant tests: `bun test` or `bun test path/to/specific/test.ts`
3. Run linting: `bun run lint` (or `bun run lint:fix` to automatically fix issues)
4. Verify functionality with a manual test if applicable

### Commit Strategy

- Commit frequently with clear, descriptive messages
- Follow conventional commit format where applicable:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `refactor:` for code changes that neither fix bugs nor add features
  - `docs:` for documentation changes
  - `test:` for adding or modifying tests
  - `chore:` for maintenance tasks
- Keep commits focused on specific changes
- Include references to issues or documentation where appropriate

## CI/CD Integration

The project maintains the existing CI/CD workflows from the original project.

### GitHub Actions

- The existing GitHub Actions workflows are maintained for the new architecture
- CI runs include:
  - Linting
  - Type checking
  - Unit tests
  - Build verification
- Run the same checks locally before merging a feature branch into `main`

### Husky Hooks

The project uses Husky hooks to enforce quality checks before commits:

- **pre-commit**: Runs linting and formatting checks
- **pre-push**: Runs type checking and tests

Do not bypass hooks. Fix the failing checks instead.

## Environment Management

### Environment Variables

- Brain instances use `.env` files for secret configuration
- `brain init` scaffolds a `.env.example` into the brain directory; use it as the
  template (there is no committed `.env.example` at the monorepo root)
- Never commit actual `.env` files
- Environment variables are validated using Zod schemas

### Required Environment Variables

```bash
# AI Service — one key per provider; set the ones your models use.
# The default chat, image and embedding models are OpenAI's.
OPENAI_API_KEY=your-openai-key
# ANTHROPIC_API_KEY=your-anthropic-key
# GOOGLE_GENERATIVE_AI_API_KEY=your-google-key

# Optional: git-backed sync of brain content
GIT_SYNC_TOKEN=ghp_...

# Optional static token for MCP HTTP clients: local development only; a production brain refuses it
MCP_AUTH_TOKEN=...

# Optional: Discord interface
DISCORD_BOT_TOKEN=...

# Optional: Cloudflare Origin CA bootstrap
CF_API_TOKEN=...
CF_ZONE_ID=...
```

All non-secret config (domain, ports, repos, plugin overrides) belongs in `brain.yaml`, not `.env`. See `docs/brain-model.md` for the split.

### Managing .env Files

1. In the brain directory, copy the scaffolded `.env.example` to `.env` for local development
2. Add required API keys and configuration values
3. For production, use environment-specific .env files (.env.production)
4. For CI/CD, set up environment variables in GitHub repository settings

## Package Management and Monorepo

The project uses Turborepo with Bun workspaces for package management:

### Package Organization

The main workspace areas are:

```
shell/*       # Core runtime, orchestration, and services
shared/*      # Utilities, themes, UI, test helpers
entities/*    # EntityPlugin packages
plugins/*     # ServicePlugin packages
interfaces/*  # InterfacePlugin packages
brains/*      # Brain model packages
sites/*       # Site packages
packages/*    # Standalone distributable packages
```

For the current package map and architecture boundaries, prefer:

- `docs/architecture-overview.md`
- `docs/architecture/package-structure.md`
- the root `package.json` workspace list

### Working with Turborepo

Common commands for monorepo management:

```bash
# Build all packages
bun run build

# Run tests across all packages
bun test

# Run linting across all packages
bun run lint
bun run lint:fix  # Auto-fix issues

# Type checking
bun run typecheck

# Run specific task in specific package
bun run --filter @brains/link test
bun run --filter @brains/chat-repl build

# Install dependencies
bun install  # Installs all workspace dependencies
```

### Package Dependencies

- Use workspace protocol for internal dependencies: `"@brains/utils": "workspace:*"`
- Keep external dependencies at the package level where they're used
- Shared configuration packages use peer dependencies

## Testing Strategy

### Test Focus

- Prefer the smallest relevant check set first
- Test behavior, not implementation details
- Mock external dependencies where practical
- Keep tests minimal but effective
- Use evals when the behavior is model- or transcript-shaped rather than purely unit-level

### Test Organization

- Tests should mirror the directory structure of the source code when practical
- Test files should be named with `.test.ts` suffix
- Use descriptive test names that explain the expected behavior
- For canonical agent behavior, run suites from `packages/brain-cli`, not directly from `shell/ai-evaluation`

### Canonical eval workflow

Model-backed evals require explicit authorization. When authorized, use the package entrypoint:

```bash
cd packages/brain-cli
bun run eval
```

Useful variants:

```bash
# Skip the LLM judge when judge credentials are unavailable
bun run eval --skip-llm-judge

# Run one or a few targeted cases
bun run eval --skip-llm-judge --test tool-invocation-agent-approve

# Reduce flakiness for broad runs
bun run eval --skip-llm-judge --max-parallel 1

# Judge model behaviour by pass rate over independent runs (models: path)
bun run eval --samples 5 --min-pass-rate 0.8
```

`bun run eval` builds the brain first, so a run evaluates the current source rather than the last build. Each suite in `brain.eval.yaml` boots one composition and runs the cases tagged for it (`recipe-<suite>`): `headless`, `personal`, `professional`, `providers`, `network`, `team` and `docs`. `network` calls live third-party hosts, such as peer brains and the pages links are saved from, so the other suites never depend on them.

```bash
bun run eval --suite network
```

Cases tagged `requires-supervised-git` need the supervised Git broker, which an in-process eval brain does not run. They run against the publishing test app through its MCP endpoint, authenticated with a local development token:

```bash
# Terminal 1: needs OPENAI_API_KEY, from the environment or test-apps/publishing/.env;
# the app seeds itself and creates its local git remote on first boot
MCP_AUTH_TOKEN=dev-token sh scripts/start-test-app.sh publishing

# Terminal 2
MCP_AUTH_TOKEN=dev-token bun run eval:git
```

`--mcp-basic --url` evaluates any running brain this way. Its static token is a non-Anchor Admin, so cases that need another caller are refused.

### Plugin evals

A package's plugin evals live in `evals/` and run with the package's `bun run eval`. `evals/eval.yaml` names the plugin they run against:

```yaml
plugin: "@brains/faq" # the module to import
export: default # the export providing the plugin; the default export when omitted
pluginId: faq # the plugin id the canonical brain installs the package under
ownedTypePluginId: faq-entity # where a service keeping its type's id installs that type
model: gpt-5.4-mini
config: {} # optional, passed to the package, plugin class or factory
```

The loader takes only the named export, so adding an export never changes which plugin the evals run against. An export that is a plugin package definition, such as a declarative entity package's default export, is instantiated with `config`, as a brain installs it. `pluginId: wishlist` installs a first-party entity package under the plugin id the canonical brain keeps for it. A first-party service that keeps an id its own type has, as faq does, also names where that type installs (`ownedTypePluginId: faq-entity`), as the canonical brain installs it. Each plugin test case addresses its handler by that plugin's id (`plugin: faq`). A plugin that exists only for its evals, such as the SWOT eval plugin, is served from an eval-only `./eval` subpath (`src/eval/`), which production code never imports.

### Example Unit Tests

Testing a plugin with the provided harness:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createServicePluginHarness } from "@brains/plugins/test";
import faqPackage from "../src";

describe("the faq package", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;

  beforeEach(async () => {
    harness = createServicePluginHarness();
    for (const plugin of instantiatePluginPackageDefinition(
      faqPackage,
      {},
      { name: "@brains/faq", version: "0.0.0" },
      { pluginId: "faq", ownedTypePluginId: "faq-entity" },
    ))
      await harness.installPlugin(plugin);
  });

  it("registers the faq entity type on install", async () => {
    expect(harness.getRegisteredEntityTypes()).toContain("faq");
  });
});
```

Testing a service component:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { EntityService } from "../src";
import { createMockDatabase } from "../test/helpers";

describe("EntityService", () => {
  let entityService: EntityService;

  beforeEach(() => {
    const db = createMockDatabase();
    entityService = EntityService.createFresh({ db });
  });

  it("should create and retrieve entities", async () => {
    const entity = {
      entityType: "link",
      title: "Test Link",
      content: "Test content",
    };

    const { entityId } = await entityService.createEntity({ entity });
    expect(entityId).toBeTruthy();

    const retrieved = await entityService.getEntity({
      entityType: "link",
      id: entityId,
    });
    expect(retrieved).toMatchObject(entity);
  });
});
```

## Documentation

### Documentation-First Approach

1. Write or update documentation before implementing
2. Keep implementation aligned with documentation
3. Reference documentation in code where applicable

### JSDoc Comments

Add comprehensive JSDoc comments for all public methods and interfaces:

```typescript
/**
 * Processes a natural language query using the entity model
 *
 * @param query - The user's natural language query
 * @param options - Optional settings for query processing
 * @returns The query result with structured data
 * @throws Error if the query cannot be processed
 */
async processQuery<T = unknown>(query: string, options?: QueryOptions<T>): Promise<QueryResult<T>>
```

## Review Process

### Merge-to-main Workflow

This repo does not use pull requests. Work happens in a local feature branch or
worktree and is merged directly into `main`:

- Keep each branch small and focused on a specific change
- Run the local checks (`bun run typecheck`, `bun run test`, `bun run lint`)
  before merging; the husky hooks enforce this on commit/push
- Merge the feature branch into `main` locally, then push `main`
- Include context and reasoning in commit messages; reference relevant
  documentation where helpful

### Code Review Checklist

When reviewing code, check for:

1. Adherence to architectural principles
2. Component Interface Standardization pattern usage
3. Proper error handling
4. Comprehensive testing
5. Documentation updates
6. Performance considerations

## Troubleshooting

### Common Issues

- **Type errors**: Ensure interfaces are properly defined and implementations match
- **Test failures**: Check that mocks are correctly set up and reset between tests
- **Build errors**: Verify package.json configurations and dependencies
- **Runtime errors**: Check for proper error handling and fallback strategies

### Getting Help

If you encounter issues:

1. Check the existing documentation under `docs/` and per-package READMEs
2. Review test files for expected behavior
3. Run `bunx turbo typecheck` and `bun test` to surface schema/contract drift
4. Check the issue tracker on GitHub
