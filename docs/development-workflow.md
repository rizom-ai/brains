# Development Workflow

This document outlines the development workflow and best practices for the Personal Brain Rebuild project.

## Development Setup

### Prerequisites

- **Bun**: Version 1.1.0 or later
- **Node.js**: Version 20+ (for compatibility with some tools)
- **Git**: For version control
- **SQLite**: Included with most systems

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/your-org/brains.git
cd brains

# Install dependencies
bun install

# Copy environment configuration
cp example.env .env

# Edit .env and add your API keys
# Minimum required: ANTHROPIC_API_KEY

# Initialize the database
bun run --filter @brains/test-brain init

# Run the development server
bun run --filter @brains/test-brain dev
```

### Development Tools

Recommended VS Code extensions:

- **ESLint**: For linting support
- **Prettier**: For code formatting
- **Bun for Visual Studio Code**: Bun runtime support
- **TypeScript and JavaScript**: Enhanced language support

### Local Development

```bash
# Start the CLI interface
bun run --filter @brains/cli dev

# Start the MCP server
bun run --filter @brains/mcp dev

# Start the web server
bun run --filter @brains/webserver dev

# Start all interfaces (using test-brain app)
bun run --filter @brains/test-brain dev
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

To skip hooks in exceptional circumstances (not recommended):

```bash
git commit --no-verify -m "Your message"
```

## Environment Management

### Environment Variables

- The project uses .env files for configuration
- Use the `example.env` file as a template
- Never commit actual .env files to the repository
- Environment variables are validated using Zod schemas

### Required Environment Variables

```bash
# AI Service Configuration
ANTHROPIC_API_KEY=your-api-key-here

# Database Configuration (optional, defaults to local SQLite)
DATABASE_PATH=./data/brain.db

# Server Configuration
PORT=3000
HOST=localhost

# Matrix Bot Configuration (if using Matrix interface)
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@bot:matrix.org
MATRIX_ACCESS_TOKEN=your-token
MATRIX_DEVICE_ID=your-device-id

# Deployment Configuration
DOCKER_REGISTRY=your-registry.com
APP_NAME=personal-brain
```

### Managing .env Files

1. Copy `example.env` to `.env` for local development
2. Add required API keys and configuration values
3. For production, use environment-specific .env files (.env.production)
4. For CI/CD, set up environment variables in GitHub repository settings

## Package Management and Monorepo

The project uses Turborepo with Bun workspaces for package management:

### Package Organization

```
brains/
├── apps/                  # Application instances
│   ├── test-brain/       # Reference implementation
│   ├── team-brain/       # Team collaboration instance
│   └── app/             # High-level framework
├── interfaces/           # User interfaces
│   ├── cli/             # Command-line interface
│   ├── matrix/          # Matrix bot interface
│   ├── mcp/             # MCP transport layer
│   └── webserver/       # HTTP server
├── plugins/             # Feature extensions
│   ├── link/            # Web content capture
│   ├── summary/         # AI summarization
│   ├── topics/          # Topic extraction
│   └── ...             # Other plugins
├── shell/              # Core infrastructure
│   ├── core/           # Central shell
│   ├── entity-service/ # Entity management
│   ├── ai-service/     # AI integration
│   └── ...            # Other services
└── shared/            # Cross-cutting concerns
    ├── utils/         # Common utilities
    └── ui-library/    # Shared UI components
```

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
bun run --filter @brains/cli build

# Install dependencies
bun install  # Installs all workspace dependencies
```

### Package Dependencies

- Use workspace protocol for internal dependencies: `"@brains/utils": "workspace:*"`
- Keep external dependencies at the package level where they're used
- Shared configuration packages use peer dependencies

## Testing Strategy

### Unit Testing Focus

- Focus exclusively on unit tests
- Test behavior, not implementation details
- Always mock dependencies
- Keep tests minimal but effective

### Test Organization

- Tests should mirror the directory structure of the source code
- Test files should be named with `.test.ts` suffix
- Use descriptive test names that explain the expected behavior

### Example Unit Tests

Testing a plugin with the provided harness:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createCorePluginHarness } from "@brains/plugins/test";
import { LinkPlugin } from "../src";

describe("LinkPlugin", () => {
  let harness: ReturnType<typeof createCorePluginHarness>;
  let plugin: LinkPlugin;

  beforeEach(async () => {
    harness = createCorePluginHarness();
    plugin = new LinkPlugin();
    await harness.installPlugin(plugin);
  });

  it("should capture link content", async () => {
    const result = await harness.executeTool("link_capture", {
      url: "https://example.com",
      conversationId: "test-conv",
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("entityId");
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

    const { entityId } = await entityService.createEntity(entity);
    expect(entityId).toBeTruthy();

    const retrieved = await entityService.getEntity("link", entityId);
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

1. Check the existing documentation
2. Review test files for expected behavior
3. Consult the old-code-reference directory
4. Use the established communication channels for assistance
