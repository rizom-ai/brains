# Development Workflow

This document outlines the development workflow and best practices for the Personal Brain Rebuild project.

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

- The project follows the existing .env approach
- Use the `example.env` file as a template
- Never commit actual .env files to the repository
- Use environment variable validation with zod-env

### Managing .env Files

1. Copy `example.env` to `.env` for local development
2. Add any required API keys or configuration values
3. For CI/CD, set up environment variables in the GitHub repository settings

## Package Management and Monorepo

As the project uses Turborepo for package management:

### Package Organization

- Stable components that reach maturity should be moved to separate packages
- Each package should have its own:
  - Package.json
  - Tests
  - Documentation
  - Build configuration

### Working with Turborepo

- Use `turbo run build` to build all packages
- Use `turbo run test` to run tests across all packages
- Use `turbo run lint` to run linting across all packages
- Use workspaces to manage dependencies between packages

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

### Example Unit Test

```typescript
import { beforeEach, describe, expect, test, mock } from "bun:test";
import { SomeComponent } from "./someComponent";
import { Dependency } from "./dependency";

// Mock dependencies
mock.module("./dependency", () => ({
  Dependency: {
    getInstance: () => ({
      doSomething: () => "mocked result",
    }),
    resetInstance: () => {},
  },
}));

describe("SomeComponent", () => {
  // Reset singleton before each test
  beforeEach(() => {
    SomeComponent.resetInstance();
  });

  test("should perform expected behavior", () => {
    // Test the behavior, not the implementation
    const component = SomeComponent.getInstance();
    const result = component.performAction();

    expect(result).toBe("expected result");
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
