# Brain Deployment Tool

The deployment system provides both shell scripts (for maximum compatibility) and a Bun TypeScript wrapper (for better developer experience).

## Quick Start

```bash
# Using the Bun wrapper (recommended for development)
bun run brain:deploy                           # Interactive mode
bun run brain:deploy test-brain                # Deploy with defaults
bun run brain:deploy test-brain hetzner deploy # Full command

# Using shell scripts directly (for CI/CD)
./scripts/deploy-brain.sh test-brain hetzner deploy
```

## Bun Wrapper Features

### Type Safety
- Validates app configuration before running
- Type-safe provider and action options
- Better error messages

### Interactive Mode
Run without arguments for a guided experience:
```bash
bun run brain:deploy

🧠 Brain Deployment Tool

Available apps:
  1. test-brain
  2. work-brain

Select app (number or name): 1

Available providers:
  1. hetzner
  2. aws

Select provider (default: hetzner): 

Available actions:
  1. deploy
  2. update  
  3. status
  4. destroy

Select action (default: status): 1
```

### Validation
- Checks if app exists
- Validates deploy.config.json
- Confirms destructive actions
- Pre-flight checks

### Convenience Commands
```bash
# List available apps and providers
bun run brain:deploy --list

# Show help
bun run brain:deploy --help
```

## Programmatic Usage

You can also use the deployment tool programmatically:

```typescript
import { deploy, validateApp } from "./scripts/deploy.ts";

// Validate app configuration
const config = await validateApp("test-brain");

// Deploy programmatically
await deploy({
  app: "test-brain",
  provider: "hetzner",
  action: "deploy"
});
```

## Shell Scripts vs Bun Wrapper

### Use Shell Scripts When:
- Running in CI/CD pipelines
- Bun is not available
- Maximum compatibility needed
- Debugging deployment issues

### Use Bun Wrapper When:
- Developing locally
- Want interactive mode
- Need type safety
- Prefer better error messages

Both approaches use the same underlying deployment system, so the results are identical.