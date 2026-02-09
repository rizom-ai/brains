# LinkedIn Organization Posting Support (TDD)

## Context

The social-media plugin's LinkedIn client only supports personal posting (`urn:li:person:{id}`). The collective brain needs to post on behalf of the Rizom organization, which requires `urn:li:organization:{id}` as the author. This change adds an optional `organizationId` config field — when present, all posts are authored as the organization. Backward compatible: no `organizationId` = existing personal behavior.

## Files to Modify

| File                                                    | Change                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `plugins/social-media/src/config.ts`                    | Add `organizationId` to `linkedinConfigSchema`                            |
| `plugins/social-media/test/lib/linkedin-client.test.ts` | Add org mode test suite                                                   |
| `plugins/social-media/src/lib/linkedin-client.ts`       | Add `getAuthor()`, update `publish`, `uploadImage`, `validateCredentials` |

## TDD Cycle

### RED 1: Config schema + org text post test

1. Add `organizationId: z.string().optional()` to `linkedinConfigSchema` in `config.ts`
2. Add `describe("organization mode")` test block with:
   - **Test**: "should use organization URN as author" — create client with `{ accessToken: "test-token", organizationId: "12345" }`, call `publish("Hello!", {})`, assert only 1 fetch call (no getUserId), assert `body.author === "urn:li:organization:12345"`
3. `bun test` — **fails** (client still calls `getUserId`)

### GREEN 1: Implement `getAuthor()`

4. Add private method to `LinkedInClient`:
   ```typescript
   private async getAuthor(): Promise<string> {
     if (this.config.organizationId) {
       return `urn:li:organization:${this.config.organizationId}`;
     }
     return this.getUserId();
   }
   ```
5. In `publish()` (line 61): replace `getUserId()` → `getAuthor()`, rename `userId` → `author`
6. `bun test` — **passes**, existing tests still pass

### RED 2: Image upload with org URN

7. **Test**: "should use organization URN as owner in image upload" — org client publishes with image, assert `registerUploadRequest.owner === "urn:li:organization:12345"` and no getUserId call (3 fetch calls total)
8. `bun test` — **should already pass** (author flows through to `uploadImage`)

### RED 3: Org credential validation

9. **Test**: "should validate org credentials" — mock returns `{ ok: true }`, assert `validateCredentials() === true`, assert fetch URL contains `/organizations/12345`
10. **Test**: "should return false when org validation fails" — mock returns `{ ok: false }`, assert `false`
11. `bun test` — **fails** (validateCredentials still calls getUserId)

### GREEN 3: Implement org validation

12. In `validateCredentials()`: if `config.organizationId`, fetch `/v2/organizations/{id}` and return `response.ok`
13. `bun test` — **all pass**

### REFACTOR

14. Rename `userId` param in `uploadImage()` to `author`
15. Update JSDoc to mention `w_organization_social` scope for org posting
16. `bun test`, `bun run typecheck`, `bun run lint` — all clean

## Core Design

```
getAuthor():
  IF config.organizationId → return "urn:li:organization:{id}"  (sync, no API call)
  ELSE → return getUserId()  (existing behavior, calls LinkedIn API)
```

This single method replaces direct `getUserId()` calls in `publish()`. The `uploadImage()` method already receives the author as a parameter, so it works for both modes without changes.

## Verification

```bash
bun test plugins/social-media    # all tests pass (existing + new)
bun run typecheck                # clean
bun run lint                     # clean
```
