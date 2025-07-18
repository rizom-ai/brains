import type { Command, CommandContext } from "@brains/command-registry";

export const createClearCommand = (): Command => ({
  name: "clear",
  description: "Clear the screen",
  handler: async (
    _args: string[],
    _context: CommandContext,
  ): Promise<{ type: "message"; message: string }> => {
    // The actual clearing is handled by the CLI interface
    // This just returns a confirmation message
    return {
      type: "message" as const,
      message: "\x1B[2J\x1B[H", // ANSI escape codes to clear screen and move cursor to top
    };
  },
});
