import { mock } from "bun:test";

// Create global mocks for matrix-bot-sdk
globalThis.mockMatrixClient = {
  start: mock(() => Promise.resolve()),
  stop: mock(() => Promise.resolve()),
  on: mock(() => {}),
  off: mock(() => {}),
  sendMessage: mock((_roomId, content) => {
    // Store the last sent message content for testing
    globalThis.mockMatrixClient._lastSentContent = content;
    return Promise.resolve("event_123");
  }),
  sendTyping: mock(() => Promise.resolve()),
  setTyping: mock(() => Promise.resolve()),
  sendReaction: mock(() => Promise.resolve()),
  sendReply: mock(() => Promise.resolve("event_123")),
  sendFormattedMessage: mock(() => Promise.resolve("event_123")),
  joinRoom: mock(() => Promise.resolve("!joined:example.org")),
  leaveRoom: mock(() => Promise.resolve()),
  getUserId: mock(() => Promise.resolve("@bot:example.org")),
  sendEvent: mock(() => Promise.resolve("event_123")),
  setDisplayName: mock(() => Promise.resolve()),
  getJoinedRooms: mock(() =>
    Promise.resolve(["!room1:example.org", "!room2:example.org"]),
  ),
  getRoomStateEvent: mock(() => Promise.resolve({})),
  _lastSentContent: null,
};

globalThis.mockAutoJoinMixin = {
  setupOnClient: mock(() => {}),
};

// Mock the entire matrix-bot-sdk module
void mock.module("matrix-bot-sdk", () => ({
  MatrixClient: class MockMatrixClient {
    constructor() {
      return globalThis.mockMatrixClient;
    }
  },
  AutojoinRoomsMixin: {
    setupOnClient: globalThis.mockAutoJoinMixin.setupOnClient,
  },
  SimpleFsStorageProvider: class MockStorageProvider {
    constructor() {}
  },
  LogLevel: {
    INFO: "info",
  },
  LogService: {
    setLogger: mock(() => {}),
    setLevel: mock(() => {}),
  },
  RichConsoleLogger: class MockLogger {},
}));
