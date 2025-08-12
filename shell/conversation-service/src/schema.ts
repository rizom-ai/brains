import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Conversations table - tracks conversation sessions
 */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(), // CLI session ID, Matrix room ID, etc.
    interfaceType: text("interface_type").notNull(), // 'cli' | 'matrix' | 'mcp'
    channelId: text("channel_id").notNull(), // Channel or room identifier
    started: text("started").notNull(),
    lastActive: text("last_active").notNull(),
    metadata: text("metadata"), // JSON string for additional optional data
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_conversations_session").on(table.sessionId),
    channelIdx: index("idx_conversations_channel").on(table.channelId),
    interfaceSessionIdx: index("idx_conversations_interface_session").on(
      table.interfaceType,
      table.sessionId,
    ),
    interfaceChannelIdx: index("idx_conversations_interface_channel").on(
      table.interfaceType,
      table.channelId,
    ),
  }),
);

/**
 * Messages table - stores individual messages in conversations
 */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    timestamp: text("timestamp").notNull(),
    metadata: text("metadata"), // JSON string for command used, entity refs, etc.
  },
  (table) => ({
    conversationIdx: index("idx_messages_conversation").on(
      table.conversationId,
    ),
    timestampIdx: index("idx_messages_timestamp").on(table.timestamp),
  }),
);

/**
 * Summary tracking table - tracks when summaries were created
 */
export const summaryTracking = sqliteTable("summary_tracking", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => conversations.id, { onDelete: "cascade" }),
  lastSummarizedAt: text("last_summarized_at"),
  lastMessageId: text("last_message_id"),
  messagesSinceSummary: integer("messages_since_summary").default(0),
  updated: text("updated").notNull(),
});

// Type exports for use in the service
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type SummaryTracking = typeof summaryTracking.$inferSelect;
export type NewSummaryTracking = typeof summaryTracking.$inferInsert;
