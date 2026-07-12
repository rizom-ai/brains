import {
  index,
  integer,
  sqliteTable,
  text,
  type SQLiteColumn,
  type SQLiteTableWithColumns,
} from "drizzle-orm/sqlite-core";

type ConversationTextColumn<
  TTable extends string,
  TName extends string,
  TNotNull extends boolean,
  TPrimaryKey extends boolean = false,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTable;
    dataType: "string";
    columnType: "SQLiteText";
    data: TNotNull extends true ? string : string | null;
    driverParam: string;
    notNull: TNotNull;
    hasDefault: false;
    isPrimaryKey: TPrimaryKey;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: [string, ...string[]];
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  { length: number | undefined }
>;

type ConversationIntegerColumn<
  TTable extends string,
  TName extends string,
  THasDefault extends boolean,
> = SQLiteColumn<
  {
    name: TName;
    tableName: TTable;
    dataType: "number";
    columnType: "SQLiteInteger";
    data: number | null;
    driverParam: number;
    notNull: false;
    hasDefault: THasDefault;
    isPrimaryKey: false;
    isAutoincrement: false;
    hasRuntimeDefault: false;
    enumValues: undefined;
    baseColumn: never;
    identity: undefined;
    generated: undefined;
  },
  Record<string, never>,
  Record<string, never>
>;

type ConversationsTable = SQLiteTableWithColumns<{
  name: "conversations";
  schema: undefined;
  columns: {
    id: ConversationTextColumn<"conversations", "id", true, true>;
    sessionId: ConversationTextColumn<"conversations", "session_id", true>;
    interfaceType: ConversationTextColumn<
      "conversations",
      "interface_type",
      true
    >;
    channelId: ConversationTextColumn<"conversations", "channel_id", true>;
    started: ConversationTextColumn<"conversations", "started", true>;
    lastActive: ConversationTextColumn<"conversations", "last_active", true>;
    metadata: ConversationTextColumn<"conversations", "metadata", false>;
    created: ConversationTextColumn<"conversations", "created", true>;
    updated: ConversationTextColumn<"conversations", "updated", true>;
  };
  dialect: "sqlite";
}>;

type MessagesTable = SQLiteTableWithColumns<{
  name: "messages";
  schema: undefined;
  columns: {
    id: ConversationTextColumn<"messages", "id", true, true>;
    conversationId: ConversationTextColumn<"messages", "conversation_id", true>;
    role: ConversationTextColumn<"messages", "role", true>;
    content: ConversationTextColumn<"messages", "content", true>;
    timestamp: ConversationTextColumn<"messages", "timestamp", true>;
    metadata: ConversationTextColumn<"messages", "metadata", false>;
  };
  dialect: "sqlite";
}>;

type SummaryTrackingTable = SQLiteTableWithColumns<{
  name: "summary_tracking";
  schema: undefined;
  columns: {
    conversationId: ConversationTextColumn<
      "summary_tracking",
      "conversation_id",
      true,
      true
    >;
    lastSummarizedAt: ConversationTextColumn<
      "summary_tracking",
      "last_summarized_at",
      false
    >;
    lastMessageId: ConversationTextColumn<
      "summary_tracking",
      "last_message_id",
      false
    >;
    messagesSinceSummary: ConversationIntegerColumn<
      "summary_tracking",
      "messages_since_summary",
      true
    >;
    updated: ConversationTextColumn<"summary_tracking", "updated", true>;
  };
  dialect: "sqlite";
}>;

/**
 * Conversations table - tracks conversation sessions
 */
export const conversations: ConversationsTable = sqliteTable(
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
export const messages: MessagesTable = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant'
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
export const summaryTracking: SummaryTrackingTable = sqliteTable(
  "summary_tracking",
  {
    conversationId: text("conversation_id")
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    lastSummarizedAt: text("last_summarized_at"),
    lastMessageId: text("last_message_id"),
    messagesSinceSummary: integer("messages_since_summary").default(0),
    updated: text("updated").notNull(),
  },
);

// Type exports for use in the service
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type SummaryTracking = typeof summaryTracking.$inferSelect;
export type NewSummaryTracking = typeof summaryTracking.$inferInsert;
