import type { AppConfig } from "@brains/app";
import { AgentService } from "@brains/ai-service";
import type { MCPProtocolMode, Tool } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { z } from "@brains/utils/zod";
import type { EvalHandlerRegistry } from "./eval-handler-registry";
import { bootEvalApp, prepareEvalEnvironment } from "./eval-environment";

const PERMISSION_LEVELS: UserPermissionLevel[] = ["public", "trusted", "admin"];
const PROTOCOL_MODES: MCPProtocolMode[] = ["basic", "debug"];

export interface RegisteredToolView {
  pluginId: string;
  tool: Tool;
}

export interface ToolSurfaceEntry {
  name: string;
  pluginId: string;
  descriptionBytes: number;
  schemaBytes: number;
}

export type PermissionToolSurface = Record<
  UserPermissionLevel,
  ToolSurfaceEntry[]
>;

export type ProtocolToolSurface = Record<
  MCPProtocolMode,
  PermissionToolSurface
>;

export interface ToolSurfaceReportInput {
  internalTools: RegisteredToolView[];
  agentTools: Record<UserPermissionLevel, RegisteredToolView[]>;
  protocolTools: Record<
    MCPProtocolMode,
    Record<UserPermissionLevel, RegisteredToolView[]>
  >;
  cliTools: RegisteredToolView[];
  /** The instructions a non-Anchor caller at each level is sent. */
  agentInstructions: Record<UserPermissionLevel, string>;
}

/** What a turn sends the model before any conversation, in bytes. */
export interface AgentPromptSize {
  instructionsBytes: number;
  descriptionBytes: number;
  schemaBytes: number;
  initialPromptBytes: number;
}

export interface ToolSurfaceReport {
  internalTools: ToolSurfaceEntry[];
  agentTools: PermissionToolSurface;
  agentPrompt: Record<UserPermissionLevel, AgentPromptSize>;
  protocolTools: ProtocolToolSurface;
  cliTools: ToolSurfaceEntry[];
}

export interface RunToolSurfaceOptions {
  config: AppConfig;
  evalHandlerRegistry: EvalHandlerRegistry;
  brainModelPath?: string | undefined;
  cloneData: boolean;
}

export async function runToolSurfaceReport(
  options: RunToolSurfaceOptions,
): Promise<ToolSurfaceReport> {
  const evalDbBase = prepareEvalEnvironment({
    brainModelPath: options.brainModelPath,
    config: options.config,
    cloneData: options.cloneData,
    suffix: "tool-surface",
  });

  const app = await bootEvalApp({
    evalDbBase,
    config: options.config,
    evalHandlerRegistry: options.evalHandlerRegistry,
  });

  try {
    const shell = app.getShell();
    const mcpService = shell.getMCPService();
    const agentService = shell.getAgentService();
    if (!(agentService instanceof AgentService)) {
      throw new Error(
        "Tool surface report needs the brain's own agent service",
      );
    }
    return createToolSurfaceReport({
      internalTools: mcpService.listTools(),
      agentTools: byPermission((level) =>
        mcpService.listAgentToolsForPermissionLevel(level),
      ),
      protocolTools: {
        basic: byPermission((level) =>
          mcpService.listProtocolToolsForPermissionLevel(level, "basic"),
        ),
        debug: byPermission((level) =>
          mcpService.listProtocolToolsForPermissionLevel(level, "debug"),
        ),
      },
      cliTools: mcpService.getCliTools(),
      agentInstructions: byPermission((level) =>
        agentService.instructionsFor(level, { isAnchor: false }),
      ),
    });
  } finally {
    await app.getShell().shutdown();
  }
}

export function createToolSurfaceReport(
  input: ToolSurfaceReportInput,
): ToolSurfaceReport {
  const agentTools = mapPermissionTools(input.agentTools);
  return {
    internalTools: toEntries(input.internalTools),
    agentTools,
    agentPrompt: byPermission((level) =>
      promptSize(input.agentInstructions[level], agentTools[level]),
    ),
    protocolTools: {
      basic: mapPermissionTools(input.protocolTools.basic),
      debug: mapPermissionTools(input.protocolTools.debug),
    },
    cliTools: toEntries(input.cliTools),
  };
}

export function renderToolSurfaceReport(report: ToolSurfaceReport): string {
  return [
    "# Tool Surface Report",
    "",
    renderSummary(report),
    "",
    renderEntries("Internal registry", report.internalTools),
    renderPermissionSurface("Agent tools", report.agentTools),
    renderPermissionSurface("MCP basic tools", report.protocolTools.basic),
    renderPermissionSurface("MCP debug tools", report.protocolTools.debug),
    renderEntries("CLI tools", report.cliTools),
  ].join("\n");
}

function byPermission<T>(
  valueFor: (level: UserPermissionLevel) => T,
): Record<UserPermissionLevel, T> {
  return {
    public: valueFor("public"),
    trusted: valueFor("trusted"),
    admin: valueFor("admin"),
  };
}

function mapPermissionTools(
  tools: Record<UserPermissionLevel, RegisteredToolView[]>,
): PermissionToolSurface {
  return {
    public: toEntries(tools.public),
    trusted: toEntries(tools.trusted),
    admin: toEntries(tools.admin),
  };
}

function toEntries(tools: RegisteredToolView[]): ToolSurfaceEntry[] {
  return tools.map(toEntry).sort(compareEntries);
}

function toEntry({ pluginId, tool }: RegisteredToolView): ToolSurfaceEntry {
  return {
    name: tool.name,
    pluginId,
    descriptionBytes: byteLength(tool.description),
    schemaBytes: byteLength(
      JSON.stringify(z.toJSONSchema(z.object(tool.inputSchema))),
    ),
  };
}

function promptSize(
  instructions: string,
  tools: ToolSurfaceEntry[],
): AgentPromptSize {
  const instructionsBytes = byteLength(instructions);
  const descriptionBytes = sum(tools.map((tool) => tool.descriptionBytes));
  const schemaBytes = sum(tools.map((tool) => tool.schemaBytes));
  return {
    instructionsBytes,
    descriptionBytes,
    schemaBytes,
    initialPromptBytes: instructionsBytes + descriptionBytes + schemaBytes,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function compareEntries(
  left: ToolSurfaceEntry,
  right: ToolSurfaceEntry,
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.pluginId.localeCompare(right.pluginId)
  );
}

function renderSummary(report: ToolSurfaceReport): string {
  return [
    `Internal registry: ${report.internalTools.length}`,
    `CLI tools: ${report.cliTools.length}`,
    ...PERMISSION_LEVELS.map(
      (level) =>
        `Agent tools (${labelPermission(level)}): ${report.agentTools[level].length}`,
    ),
    ...PERMISSION_LEVELS.map((level) => {
      const size = report.agentPrompt[level];
      return `Agent prompt (${labelPermission(level)}): instructions ${size.instructionsBytes} bytes, tool descriptions ${size.descriptionBytes} bytes, tool schemas ${size.schemaBytes} bytes, initial prompt ${size.initialPromptBytes} bytes`;
    }),
    ...PROTOCOL_MODES.flatMap((mode) =>
      PERMISSION_LEVELS.map(
        (level) =>
          `MCP ${mode} tools (${labelPermission(level)}): ${report.protocolTools[mode][level].length}`,
      ),
    ),
  ].join("\n");
}

function renderPermissionSurface(
  title: string,
  surface: PermissionToolSurface,
): string {
  return PERMISSION_LEVELS.map((level) =>
    renderEntries(`${title} (${labelPermission(level)})`, surface[level]),
  ).join("\n");
}

function renderEntries(title: string, entries: ToolSurfaceEntry[]): string {
  if (entries.length === 0) return `## ${title}\n\n(none)\n`;
  return [
    `## ${title}`,
    "",
    ...entries.map(
      (entry) =>
        `- ${entry.name} (${entry.pluginId}) — description ${entry.descriptionBytes} bytes, schema ${entry.schemaBytes} bytes`,
    ),
    "",
  ].join("\n");
}

function labelPermission(level: UserPermissionLevel): string {
  return level[0]?.toUpperCase() + level.slice(1);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
