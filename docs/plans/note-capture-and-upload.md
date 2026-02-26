# Plan: Note Capture & Upload from Chat Interface

**Created**: 2026-02-26
**Status**: Planned

## Context

Users interact with the brain through client-side interfaces like Matrix. They want two capabilities during chat:

1. **Quick capture** — Save conversation content as a note ("save this conversation as a note")
2. **File upload** — Send a markdown file attachment in Matrix and have it passed to the AI agent

Currently, Matrix silently ignores all non-text messages (`interfaces/matrix/src/lib/matrix-interface.ts:199-201`). The note plugin only has `note_create` (manual title+content) and `note_generate` (AI from prompt).

---

## Part 1: Conversation Capture Tool (note plugin)

Add `note_save-conversation` tool. The AI agent calls this when a user says "save this conversation" or similar.

### File: `plugins/note/src/tools/index.ts`

Add schema:

```typescript
const saveConversationInputSchema = z.object({
  conversationId: z.string().describe("The conversation ID to save"),
  title: z.string().optional().describe("Title (auto-generated if omitted)"),
  messageLimit: z
    .number()
    .optional()
    .describe("Max recent messages to include"),
});
```

Handler:

- Fetch messages via `context.conversations.getMessages(conversationId, { limit })` (available on `CorePluginContext` — `shell/plugins/src/core/context.ts:160-172`)
- Return error if empty
- Format as markdown: role headers + content, separated by `---`
- Auto-generate title as `"Conversation — {date}"` if not provided
- Create entity via `noteAdapter.createNoteContent(title, body)` + `entityService.createEntity()`
- Synchronous — no job queue needed

Also update `note_create` description for better AI routing when users say "save that as a note".

### File: `plugins/note/test/tools.test.ts`

Add tests for `note_save-conversation`:

- Should save conversation messages as a note
- Should handle empty conversation
- Should respect messageLimit
- Should auto-generate title

---

## Part 2: File Upload Support (base class + Matrix)

The file handling logic lives in the **base `MessageInterfacePlugin`** class. Matrix only handles the transport-specific part (detecting `m.file` events, downloading from `mxc://` URLs).

### Step 2a: Add file upload utilities to `MessageInterfacePlugin`

**File:** `shell/plugins/src/message-interface/message-interface-plugin.ts`

Add protected methods and constants that any message interface can use:

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

These are simple, stateless utilities — no refactoring of the existing message handling flow needed.

### Step 2b: Add `downloadContent` to Matrix client wrapper

**File:** `interfaces/matrix/src/client/matrix-client.ts`

Add method wrapping `matrix-bot-sdk`'s built-in `downloadContent(mxcUrl)` (returns `{ data: Buffer, contentType: string }`).

### Step 2c: Handle `m.file` in Matrix interface

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
| `plugins/note/src/tools/index.ts`                                       | Add `save-conversation` tool + schema; update `note_create` description    |
| `plugins/note/test/tools.test.ts`                                       | Add tests for `save-conversation`                                          |
| `shell/plugins/src/message-interface/message-interface-plugin.ts`       | Add `isUploadableTextFile`, `isFileSizeAllowed`, `formatFileUploadMessage` |
| `interfaces/matrix/src/client/matrix-client.ts`                         | Add `downloadContent()` method                                             |
| `interfaces/matrix/src/lib/matrix-interface.ts`                         | Handle `m.file` events; extract `routeToAgent` helper                      |
| `shell/plugins/test/message-interface/message-interface-plugin.test.ts` | Add tests for file upload utilities                                        |
| `interfaces/matrix/test/matrix-interface.test.ts`                       | Add tests for file attachment handling                                     |

**No changes to:**

- `plugins/note/src/plugin.ts` — `createNoteTools()` already called, new tool auto-included
- `plugins/note/src/adapters/note-adapter.ts` — `createNoteContent()` already exists
- App configuration — no new plugin to register

---

## Verification

1. `bun run typecheck` — all packages clean
2. `bun test plugins/note/` — note plugin tests
3. `bun test shell/plugins/` — base class tests
4. `bun test interfaces/matrix/` — matrix interface tests
5. `bun run lint` — clean
6. Manual: In Matrix, send "save this conversation as a note" — bot creates note entity
7. Manual: In Matrix, upload a `.md` file — bot receives content, agent processes it
