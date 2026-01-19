# AI SDK Stabilization Plan

## Status: Blocked

Waiting for stable AI SDK v6 release from Vercel.

## Problem

Core AI functionality depends on 3 beta packages:

| Package             | Current Version |
| ------------------- | --------------- |
| `ai`                | 6.0.0-beta.133  |
| `@ai-sdk/anthropic` | 3.0.0-beta.75   |
| `@ai-sdk/openai`    | 3.0.0-beta.75   |

Additionally, there's a `@ts-ignore` workaround in `shell/ai-service/src/aiService.ts:155` for Zod v3 type incompatibility with the beta SDK.

## Risk Assessment

- **Risk Level**: High (beta dependencies in production)
- **Impact**: AI service core functionality
- **Current Status**: Functional with workaround

## Files to Modify

| File                                | Changes                                  |
| ----------------------------------- | ---------------------------------------- |
| `shell/ai-service/package.json`     | Update to stable versions when available |
| `shell/ai-service/src/aiService.ts` | Remove `@ts-ignore` if types are fixed   |

## Implementation Steps

1. **Monitor**: Track Vercel AI SDK releases for stable v6
2. **Test**: When stable releases become available, test in branch:
   ```bash
   bun update ai @ai-sdk/anthropic @ai-sdk/openai
   bun run typecheck
   bun test shell/ai-service
   ```
3. **Verify**: Check if `@ts-ignore` can be removed
4. **Deploy**: If all tests pass, merge

## Verification Commands

```bash
# Check for type errors
bun run typecheck

# Run AI service tests
bun test shell/ai-service

# Test generateObject specifically
bun test shell/ai-service/test/aiService.test.ts -t "generateObject"
```

## Notes

- Current workaround is functional and stable
- No action required until stable SDK is released
- Monitor: https://github.com/vercel/ai/releases
