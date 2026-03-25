import { MCPBridgePlugin } from "@brains/mcp-bridge";
import type { ServerCommand } from "@brains/mcp-bridge";
import { hackmdConfigSchema, type HackMDConfig } from "./config";
import packageJson from "../package.json";

/**
 * HackMD plugin — read-only access to a user's HackMD notes.
 *
 * Spawns the hackmd-mcp server as a child process, connects via
 * MCP SDK, and exposes only read tools to the agent.
 */
export class HackMDPlugin extends MCPBridgePlugin<HackMDConfig> {
  constructor(config: Partial<HackMDConfig> = {}) {
    super("hackmd", packageJson, config, hackmdConfigSchema);
  }

  protected getServerCommand(): ServerCommand {
    return {
      command: "npx",
      args: ["-y", "hackmd-mcp"],
      env: {
        HACKMD_API_TOKEN: this.config.token,
      },
    };
  }

  protected getAllowedTools(): string[] {
    return [
      "get_user_info",
      "list_user_notes",
      "get_note",
      "get_history",
      "list_teams",
      "list_team_notes",
    ];
  }

  protected getAgentInstructions(): string {
    return [
      "## HackMD Integration",
      "",
      "Use hackmd_* tools to look up notes in the user's HackMD workspace.",
      "Use the brain's own tools (system_search, system_create, etc.) for the brain's knowledge base.",
      "Only read tools are available — never attempt to write to HackMD.",
      "",
      "Available tools:",
      "- **hackmd_get_user_info**: Get the authenticated user's profile",
      "- **hackmd_list_user_notes**: List all notes owned by the user",
      "- **hackmd_get_note**: Read a specific note by ID",
      "- **hackmd_get_history**: Get the user's reading history",
      "- **hackmd_list_teams**: List accessible teams",
      "- **hackmd_list_team_notes**: List all notes in a team",
    ].join("\n");
  }
}
