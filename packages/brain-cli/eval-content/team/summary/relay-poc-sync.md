---
conversationId: team-poc-sync
channelId: team-poc
channelName: team-poc
interfaceType: discord
timeRange:
  start: "2026-05-06T10:00:00.000Z"
  end: "2026-05-06T10:18:00.000Z"
messageCount: 8
entryCount: 1
sourceHash: team-poc-sync-v1
projectionVersion: 1
visibility: shared
---

# Conversation Summary

## Team Brain preset direction

Time: 2026-05-06T10:00:00.000Z → 2026-05-06T10:18:00.000Z
Messages summarized: 8

The team reviewed Team Brain's preset direction and agreed that Team Brain should not become a team-flavored Rover. Core should validate private team memory and coordination, default should add a minimal public site, and full should only add existing team-knowledge surfaces for now.

### Key Points

- Team Brain's center is team memory, synthesis, and peer-brain coordination.
- Publishing-heavy plugins should stay out until a Team Brain-native use case is clear.
- Draft links should still feed private topic extraction.

### Decisions

- Add summaries to core because conversations are first-class team memory.
- Keep full limited to docs and decks for the current POC.

### Action Items

- Replace generic docs fixtures with Team Brain-specific content.
- Add eval coverage for existing Team Brain plugins before adding new plugins.
