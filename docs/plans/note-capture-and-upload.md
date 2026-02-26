# Plan: Note Capture & File Upload from Chat Interface

**Created**: 2026-02-26
**Status**: Planned

## Context

Users interact with the brain through client-side interfaces like Matrix. Two capabilities are needed:

1. **Note capture from chat** — The existing `note_create` tool already works for this. The AI agent has the full conversation in context and can extract whatever the user wants to save (a response, an insight, a code snippet) and call `note_create`. No new tool needed.

2. **File upload via chat** — When a user sends a markdown file attachment in Matrix, the bot should download the content and pass it to the AI agent. The agent then decides what to do — save as a note via `note_create`, or any other action. Currently, Matrix silently ignores all non-text messages (`interfaces/matrix/src/lib/matrix-interface.ts:199-201`).

A future "entity upgrade" feature could allow notes to be promoted to richer entity types (blog post, link, etc.), but that's out of scope here.

---

## File Upload Support (base class + Matrix)

The file handling logic lives in the **base `MessageInterfacePlugin`** class so any chat interface can reuse it. Matrix only handles the transport-specific part (detecting `m.file` events, downloading from `mxc://` URLs).

### Step 1: Add file upload utilities to `MessageInterfacePlugin`

**File:** `shell/plugins/src/message-interface/message-interface-plugin.ts`

Add protected methods and constants:

```typescript
/** Max file size for text uploads (100KB) */
protected static readonly MAX_FILE_UPLOAD_SIZE = 100_000;

/** Allowed text-based file extensions */
private static readonly TEXT_FILE_EXTENSIONS = ['.md', '.txt', '.markdown'];

/** Allowed text-based MIME types */
private static readonly TEXT_MIME_TYPES = ['text/plain', 'text/markdown', 'text/x-markdown'];

/**
 * Check if a file is a supported text file for upload
 */
protected isUploadableTextFile(filename: string, mimetype?: string): boolean

/**
 * Validate file size for upload
 */
protected isFileSizeAllowed(size: number): boolean

/**
 * Format uploaded file content as an agent message
 */
protected formatFileUploadMessage(filename: string, content: string): string
```

Simple, stateless utilities — no refactoring of the existing message handling flow.

### Step 2: Add `downloadContent` to Matrix client wrapper

**File:** `interfaces/matrix/src/client/matrix-client.ts`

Wrap `matrix-bot-sdk`'s built-in `downloadContent(mxcUrl)` (returns `{ data: Buffer, contentType: string }`).

### Step 3: Handle `m.file` in Matrix interface

**File:** `interfaces/matrix/src/lib/matrix-interface.ts`

Modify `handleRoomMessage`:

1. Expand the event type to include file-related fields (`url`, `info`)
2. After the existing `m.text` handling, add a block for `m.file`:
   - Use base class `isUploadableTextFile()` and `isFileSizeAllowed()` for validation
   - Download content via Matrix client (transport-specific)
   - Format using base class `formatFileUploadMessage()`
   - Route to agent (same flow as text messages)
3. Extract the agent-routing logic into a private `routeToAgent()` method, called by both `m.text` and `m.file` paths

---

## Files to modify

| File                                                                    | Change                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `shell/plugins/src/message-interface/message-interface-plugin.ts`       | Add `isUploadableTextFile`, `isFileSizeAllowed`, `formatFileUploadMessage` |
| `interfaces/matrix/src/client/matrix-client.ts`                         | Add `downloadContent()` method                                             |
| `interfaces/matrix/src/lib/matrix-interface.ts`                         | Handle `m.file` events; extract `routeToAgent` helper                      |
| `shell/plugins/test/message-interface/message-interface-plugin.test.ts` | Add tests for file upload utilities                                        |
| `interfaces/matrix/test/matrix-interface.test.ts`                       | Add tests for file attachment handling                                     |

**No changes to:**

- Note plugin — `note_create` already handles capture; the agent decides when to call it
- App configuration — no new plugin to register

---

## Verification

1. `bun run typecheck` — all packages clean
2. `bun test shell/plugins/` — base class tests
3. `bun test interfaces/matrix/` — matrix interface tests
4. `bun run lint` — clean
5. Manual: In Matrix, upload a `.md` file — bot receives content, agent processes it
