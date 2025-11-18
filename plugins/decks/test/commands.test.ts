import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { createDecksCommands } from "../src/commands";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
  type CommandContext,
} from "@brains/plugins/test";
import type { DeckEntity } from "../src/schemas/deck";

describe("Decks Commands", () => {
  let context: ServicePluginContext;
  let logger: Logger;
  let mockShell: MockShell;
  let mockCommandContext: CommandContext;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    context = createServicePluginContext(mockShell, "decks");
    mockCommandContext = {
      messageId: "test-message-id",
      userId: "test-user",
      channelId: "test-channel",
      interfaceType: "cli",
      userPermissionLevel: "public",
    };
  });

  describe("createDecksCommands", () => {
    it("should create commands array", () => {
      const commands = createDecksCommands(context, logger);

      expect(commands).toBeDefined();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBe(1);
    });

    it("should create decks-list command", () => {
      const commands = createDecksCommands(context, logger);
      const listCommand = commands.find((cmd) => cmd.name === "decks-list");

      expect(listCommand).toBeDefined();
      expect(listCommand?.description).toBeDefined();
      expect(listCommand?.usage).toBeDefined();
      expect(listCommand?.usage).toContain("--limit");
    });

    it("decks-list should return message when no decks found", async () => {
      const commands = createDecksCommands(context, logger);
      const listCommand = commands.find((cmd) => cmd.name === "decks-list");

      // Mock empty list
      const listEntitiesSpy = spyOn(
        context.entityService,
        "listEntities",
      ).mockResolvedValue([]);

      if (listCommand) {
        const response = await listCommand.handler([], mockCommandContext);
        expect(response.type).toBe("message");
        expect(response.message).toContain("No presentation decks found");
        expect(listEntitiesSpy).toHaveBeenCalledWith("deck");
      }
    });

    it("decks-list should format and return deck list", async () => {
      const mockDecks: DeckEntity[] = [
        {
          id: "test-deck-1",
          entityType: "deck",
          content: "# Slide 1\n\n---\n\n# Slide 2",
          title: "Test Presentation",
          description: "A test presentation",
          author: "Test Author",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          metadata: { slug: "test-deck", title: "Test Deck" },
        },
        {
          id: "test-deck-2",
          entityType: "deck",
          content: "# Welcome\n\n---\n\n# End",
          title: "Another Deck",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          metadata: { slug: "test-deck", title: "Test Deck" },
        },
      ];

      const commands = createDecksCommands(context, logger);
      const listCommand = commands.find((cmd) => cmd.name === "decks-list");

      // Mock deck list
      const listEntitiesSpy = spyOn(
        context.entityService,
        "listEntities",
      ).mockResolvedValue(mockDecks);

      if (listCommand) {
        const response = await listCommand.handler([], mockCommandContext);
        expect(response.type).toBe("message");
        expect(response.message).toContain("Found 2 presentation decks");
        expect(response.message).toContain("Test Presentation");
        expect(response.message).toContain("Another Deck");
        expect(response.message).toContain("A test presentation");
        expect(response.message).toContain("Test Author");
        expect(listEntitiesSpy).toHaveBeenCalledWith("deck");
      }
    });

    it("decks-list should handle --limit argument", async () => {
      const mockDecks: DeckEntity[] = Array.from({ length: 20 }, (_, i) => ({
        id: `deck-${i}`,
        entityType: "deck",
        content: "# Slide 1\n\n---\n\n# Slide 2",
        title: `Deck ${i}`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: { slug: "test-deck", title: "Test Deck" },
      }));

      const commands = createDecksCommands(context, logger);
      const listCommand = commands.find((cmd) => cmd.name === "decks-list");

      spyOn(context.entityService, "listEntities").mockResolvedValue(mockDecks);

      if (listCommand) {
        const response = await listCommand.handler(
          ["--limit", "5"],
          mockCommandContext,
        );
        expect(response.type).toBe("message");
        expect(response.message).toContain("Found 5 presentation decks");
      }
    });

    it("decks-list should handle errors gracefully", async () => {
      const commands = createDecksCommands(context, logger);
      const listCommand = commands.find((cmd) => cmd.name === "decks-list");

      // Mock error
      spyOn(context.entityService, "listEntities").mockRejectedValue(
        new Error("Database error"),
      );

      if (listCommand) {
        const response = await listCommand.handler([], mockCommandContext);
        expect(response.type).toBe("message");
        expect(response.message).toContain("Error listing decks");
        expect(response.message).toContain("Database error");
      }
    });
  });
});
