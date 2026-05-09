# Development Workflow

This document outlines the development workflow and best practices for the Brains project.

## Development Setup

### Prerequisites

- **Bun**: Version 1.3.3 or later
- **Node.js**: Version 20+ (for runtime compatibility in CLI)
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
cd ~/Documents/yeehaa-io
cp .env.example .env   # then edit .env and add AI_API_KEY at minimum
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
- All CI checks must pass before merging pull requests

### Husky Hooks

The project uses Husky hooks to enforce quality checks before commits:

- **pre-commit**: Runs linting and formatting checks
- **pre-push**: Runs type checking and tests

Do not bypass hooks. Fix the failing checks instead.

## Environment Management

### Environment Variables

- The project uses .env files for configuration
- Use the `example.env` file as a template
- Never commit actual .env files to the repository
- Environment variables are validated using Zod schemas

### Required Environment Variables

```bash
# AI Service — single key for all providers (auto-detected from model name)
AI_API_KEY=your-api-key-here

# Optional: separate key for image generation (defaults to AI_API_KEY)
# AI_IMAGE_KEY=your-image-key-here

# Optional: git-backed sync of brain content
GIT_SYNC_TOKEN=ghp_...

# Optional deprecated static fallback for MCP HTTP clients that cannot use OAuth/passkeys
MCP_AUTH_TOKEN=...

# Optional: Discord interface
DISCORD_BOT_TOKEN=...

# Optional: Cloudflare Origin CA bootstrap
CF_API_TOKEN=...
CF_ZONE_ID=...
```

All non-secret config (domain, ports, repos, plugin overrides) belongs in `brain.yaml`, not `.env`. See `docs/brain-model.md` for the split.

### Managing .env Files

1. Copy `example.env` to `.env` for local development
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
- For Rover-specific agent behavior, run Rover evals from `brains/rover`, not from `shell/ai-evaluation`

### Rover eval workflow

For Rover behavior work, prefer the repo-standard eval entrypoint:

```bash
cd brains/rover
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
```

### Example Unit Tests

Testing a plugin with the provided harness:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createServicePluginHarness } from "@brains/plugins/test";
import { LinkPlugin } from "../src";

describe("LinkPlugin", () => {
  let harness: ReturnType<typeof createServicePluginHarness>;
  let plugin: LinkPlugin;

  beforeEach(async () => {
    harness = createServicePluginHarness();
    plugin = new LinkPlugin();
    await harness.installPlugin(plugin);
  });

  it("registers the link entity type on install", async () => {
    expect(harness.getRegisteredEntityTypes()).toContain("link");
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

### Pull Request Guidelines

- Keep PRs small and focused on specific changes
- Include links to relevant documentation
- Provide context and reasoning for changes
- Attach screenshots for UI changes if applicable

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
