# Display Channel Names in Summaries - Implementation Plan

## Overview
Display room/channel names instead of conversation IDs in summary views for better user experience.

## Implementation Strategy

### Commit 1: Update Conversation Service to Support Metadata
**Files to modify:**
- `shell/conversation-service/src/types.ts`
  - Update `IConversationService` interface to accept optional metadata in `startConversation`
- `shell/conversation-service/src/conversation-service.ts`
  - Modify `startConversation` to accept and store metadata parameter
  - Store channel name in existing metadata JSON field

### Commit 2: Update Message Interfaces to Pass Channel Names
**Files to modify:**
- `interfaces/matrix/src/client/matrix-client.ts`
  - Add `getRoomName(roomId: string)` method to fetch room display name
- `interfaces/matrix/src/handlers/room-events.ts`
  - Fetch room name when handling messages
  - Pass room name in metadata when starting conversations
- `interfaces/cli/src/cli-interface.ts`
  - Pass "CLI Terminal" as channel name when starting conversations
- `shell/plugins/src/message-interface/context.ts`
  - Update context creation to pass metadata through

### Commit 3: Update Summary Plugin to Display Channel Names
**Files to modify:**
- `shared/utils/src/formatters/formatters/channel-name.ts` (new file)
  - Create helper function to format channel names (truncate, handle special chars)
- `plugins/summary/src/datasources/summary-datasource.ts`
  - Read channel name from conversation metadata
  - Include in returned summary data
  - Store in summary entity metadata
- `plugins/summary/src/templates/summary-list/schema.ts`
  - Add `channelName` field to summary item schema
- `plugins/summary/src/templates/summary-list/layout.tsx`
  - Display channel name instead of conversationId
  - Use formatted fallback for missing names
- `plugins/summary/src/templates/summary-detail/schema.ts`
  - Add `channelName` field to detail schema
- `plugins/summary/src/templates/summary-detail/layout.tsx`
  - Display channel name in header

## Key Decisions Made
1. Store channel name in existing metadata JSON field (no migration needed)
2. Fetch and store Matrix room names when conversation starts
3. Use "CLI Terminal" for CLI sessions
4. Pass channel name through entire flow (interface → conversation → summary)
5. Display in both list and detail views
6. Fallback to formatted channelId when name unavailable
7. Create formatting helper in utils package
8. Test with both existing (fallback) and new conversations
9. Make multiple non-breaking commits

## Testing Plan
1. Test existing conversations show fallback (formatted channelId)
2. Test new Matrix conversations show room name
3. Test new CLI conversations show "CLI Terminal"
4. Verify summaries display correctly in both list and detail views