# Deployment Script Refactoring

## Overview

The deployment scripts have been refactored to eliminate duplication and improve maintainability.

## Key Improvements

### 1. Common Libraries

Created reusable libraries in `deploy/scripts/lib/`:

- `common.sh` - Logging, error handling, and utilities
- `config.sh` - Configuration loading and validation
- `platform.sh` - Platform detection and normalization
- `docker.sh` - Docker operations and registry handling
- `ssh.sh` - SSH connection utilities

### 2. Simplified Scripts

New scripts with cleaner structure:

- `deploy-brain-v2.sh` - Main deployment entry point
- `deploy-docker-v2.sh` - Docker-specific deployment
- `build-release-v2.sh` - Simplified build process

## Code Reduction

### Before

- Multiple scripts with ~500-800 lines each
- Duplicated logging functions in 7+ files
- Complex nested conditionals
- Repeated configuration parsing

### After

- Common libraries: ~400 lines total
- Main scripts: ~200-300 lines each
- Single source of truth for common operations
- Clear separation of concerns

## Usage Examples

### Old Way

```bash
# Complex, inconsistent interfaces
./scripts/deploy.sh user@server apps/test-brain/dist/release.tar.gz
./deploy/scripts/deploy-docker.sh test-brain local --registry ghcr.io/user
./scripts/build-release.sh test-brain linux-x64 --docker
```

### New Way

```bash
# Consistent, intuitive interface
./deploy/scripts/deploy-brain-v2.sh test-brain local deploy
./deploy/scripts/deploy-brain-v2.sh test-brain hetzner deploy
./scripts/build-release-v2.sh test-brain --docker
```

## Benefits

1. **Maintainability**: Changes to common functionality only need to be made once
2. **Testability**: Libraries can be tested independently
3. **Consistency**: All scripts use the same logging and error handling
4. **Extensibility**: Easy to add new providers or features
5. **Debugging**: Debug mode available across all scripts with `--debug`

## Migration Path

The original scripts remain in place for backward compatibility. To migrate:

1. Test new scripts in development
2. Update CI/CD pipelines
3. Update documentation
4. Deprecate old scripts after transition period

## Future Improvements

1. Add unit tests for library functions
2. Create provider plugin system
3. Add configuration file support (YAML/JSON)
4. Implement remote deployment in deploy-docker-v2.sh
5. Add rollback functionality
