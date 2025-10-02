# Contributing to Brains

Thank you for your interest in contributing! This guide will help you get started with the development workflow.

## Getting Started

### Prerequisites

- **Bun** >= 1.0.0 (package manager and runtime)
- **Git** for version control

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/yeehaa123/brains.git
cd brains

# Install dependencies
bun install

# Build all packages
bun run build
```

## Development Workflow

### Running Tests

```bash
# Run all tests across packages
bun run test

# Run tests in a specific package
cd plugins/system
bun test
```

### Type Checking

```bash
# Type check all packages
bun run typecheck

# The first run may take ~30s, but subsequent runs are cached (~180ms)
```

### Linting and Formatting

```bash
# Check code style
bun run lint

# Auto-fix linting issues
bun run lint:fix

# Format all code
bun run format

# Check formatting without changes
bun run format:check
```

## Monorepo Management

This is a Turborepo monorepo with 133 packages. We use specialized tools to maintain consistency:

### Dependency Management

```bash
# Check for dependency version mismatches across packages
bun run deps:check

# Automatically fix version mismatches
bun run deps:fix

# Format all package.json files consistently
bun run deps:format

# Update outdated dependencies
bun run deps:update
```

### Workspace Validation

```bash
# Check workspace structure and package.json correctness
bun run workspace:check

# Auto-fix workspace issues
bun run workspace:fix

# Visualize the dependency graph
bun run workspace:graph

# Run tests only on packages affected by recent changes
bun run workspace:affected
```

### Understanding the Monorepo

The repository is organized into:

- **`apps/`** - Brain applications (test-brain, team-brain)
- **`shell/`** - Core infrastructure packages
- **`plugins/`** - Functionality plugins (system, git-sync, topics, etc.)
- **`interfaces/`** - Interface implementations (cli, matrix, mcp, webserver)
- **`shared/`** - Shared utilities and configurations

**Important**: Changes to core packages (`shell/*`, `shared/*`) affect many dependent packages. The pre-commit hook will typecheck and test all affected packages.

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Follow existing code patterns
- Write or update tests for your changes
- Ensure TypeScript types are correct

### 3. Pre-commit Checks

When you commit, the pre-commit hook will automatically:

1. ✅ Validate workspace structure (`workspace:check`)
2. ✅ Check dependency versions (`deps:check`)
3. ✅ Format and lint staged files (`lint-staged`)
4. ✅ Type check all packages (`typecheck`)
5. ✅ Run all tests (`test`)

**Note**: Typecheck and test run on ALL packages because in a monorepo, changes in one package can affect others. Thanks to Turborepo caching, this is fast (~180ms when cached).

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature"
```

Follow conventional commit format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test changes
- `perf:` - Performance improvements

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Common Tasks

### Adding a New Package

1. Create the package directory in the appropriate folder (`shell/`, `plugins/`, etc.)
2. Create a `package.json` with required fields
3. Run `bun install` to link workspace dependencies
4. Run `bun run workspace:check` to verify correctness

### Fixing Dependency Version Mismatches

If CI fails with version mismatches:

```bash
# See what's wrong
bun run deps:check

# Fix automatically
bun run deps:fix

# Commit the changes
git add -A
git commit -m "chore: fix dependency version mismatches"
```

### Updating Dependencies

```bash
# Update all dependencies to latest versions
bun run deps:update

# Fix any resulting version mismatches
bun run deps:fix

# Test everything still works
bun run typecheck && bun run test
```

### Debugging Pre-commit Failures

If pre-commit fails:

1. **Workspace check fails**: Run `bun run workspace:fix`
2. **Dependency check fails**: Run `bun run deps:fix`
3. **Typecheck fails**: Fix TypeScript errors in the affected package
4. **Tests fail**: Fix failing tests

You can also run individual checks manually:

```bash
bun run workspace:check
bun run deps:check
bun run typecheck
bun run test
```

## Architecture Guidelines

### Plugin Development

See [Plugin System](docs/plugin-system.md) for detailed information.

- Plugins extend the brain with new functionality
- Use `@brains/plugins` base classes
- Register tools, commands, and resources
- Follow the examples in `plugins/examples/`

### Type Safety

- Always use strict TypeScript
- Define Zod schemas for data validation
- Export types from package index files
- Use `workspace:*` protocol for internal dependencies

### Testing

- Write unit tests for all new functionality
- Use Bun's built-in test runner
- Mock external dependencies
- Keep tests fast and focused

### Performance

- Turborepo caches build/test/typecheck results
- Only changed packages are rebuilt/retested
- Use `bun run workspace:affected` for selective testing

## Getting Help

- Check the [documentation](docs/)
- Look at existing code for examples
- Open an issue for questions or bugs
- Join discussions in pull requests

## Code Review Process

Pull requests will be reviewed for:

- Code quality and style
- Test coverage
- Documentation updates
- Breaking changes noted
- Performance implications

Thank you for contributing to Brains! 🧠
