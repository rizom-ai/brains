# Integration Tests

This package contains integration tests for the Brain system that require external dependencies like databases, file systems, or network services.

## Structure

- `test/db/` - Database integration tests
- `test/e2e/` - End-to-end tests (future)
- `test/helpers/` - Shared test utilities

## Running Tests

```bash
# Run all integration tests
bun test

# Run only database tests
bun test:db

# Run only e2e tests (when available)
bun test:e2e
```

## Why Separate Package?

- **Isolation**: Integration tests have different requirements than unit tests
- **Performance**: Can be run separately in CI/CD pipelines
- **Dependencies**: May require additional setup or external services
- **Timeouts**: Often need longer timeouts than unit tests
