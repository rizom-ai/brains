import type { Command, CommandContext } from "@brains/command-registry";

interface ProgressState {
  showProgress: boolean;
}

export const createProgressCommand = (state: ProgressState): Command => ({
  name: "progress",
  description: "Toggle detailed progress display",
  handler: async (
    _args: string[],
    _context: CommandContext,
  ): Promise<{ type: "message"; message: string }> => {
    state.showProgress = !state.showProgress;

    return {
      type: "message" as const,
      message: `Progress display ${state.showProgress ? "enabled" : "disabled"}`,
    };
  },
});
