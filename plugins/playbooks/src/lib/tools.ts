import type { Tool, ToolResult } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { PlaybookStatusResponse } from "./contracts";

const statusInputSchema = {
  runId: z.string().min(1).optional(),
  playbookId: z.string().min(1).optional(),
  lifecycle: z.string().min(1).optional(),
};

const startInputSchema = {
  playbookId: z.string().min(1),
  lifecycle: z.string().min(1).optional(),
};

const sendEventInputSchema = {
  runId: z.string().min(1).optional(),
  event: z.string().min(1),
  fromState: z.string().min(1).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
};

/**
 * The plugin behaviour the tool surface delegates to. Keeping this narrow lets
 * the tool declarations — names, descriptions, schemas — live apart from the
 * run machinery they drive.
 */
export interface PlaybookToolHandlers {
  getStatus(input: {
    runId?: string | undefined;
    playbookId?: string | undefined;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookStatusResponse>;
  startRun(input: {
    playbookId: string;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<ToolResult<unknown>>;
  sendEvent(input: {
    runId?: string | undefined;
    event: string;
    fromState?: string | undefined;
    context?: Record<string, unknown> | undefined;
    conversationId?: string | undefined;
  }): Promise<ToolResult<unknown>>;
}

export function buildPlaybookTools(
  pluginId: string,
  handlers: PlaybookToolHandlers,
): Tool[] {
  return [
    createTool(
      pluginId,
      "status",
      "Get playbook lifecycle config, active runs, current state, valid events, and parsed playbook body. After meaningful tool actions, use the reported current state as source of truth. Do not send an extra NEXT after runtime evidence already advanced the run. Do not claim the playbook is finished unless the run has reached a final state.",
      z.object(statusInputSchema),
      async (input, toolContext) => {
        const data = await handlers.getStatus({
          ...input,
          conversationId: toolContext.conversationId,
        });
        return { success: true, data };
      },
      {
        nameOverride: "playbook_status",
        visibility: "admin",
        sideEffects: "none",
      },
    ),
    createTool(
      pluginId,
      "start",
      "Start a playbook run, or resume an existing active run. If the operator asks to start a playbook by title, use the stable slug/id form when known (for example lowercase words joined by hyphens) instead of claiming it is unavailable without calling this tool. Do not call this to continue an already active playbook; use playbook_status and playbook_send_event with a valid event instead.",
      z.object(startInputSchema),
      async (input, toolContext) =>
        handlers.startRun({
          ...input,
          conversationId: toolContext.conversationId,
        }),
      {
        nameOverride: "playbook_start",
        visibility: "admin",
        sideEffects: "writes",
      },
    ),
    createTool(
      pluginId,
      "send_event",
      "Send an event to a playbook run state machine and persist the resulting state. Invalid events return an error. Always pass fromState set to the current state id you are acting on (from playbook_status or the active-playbook context); if the run has advanced past that state, the event is rejected as stale and you must call playbook_status and act on the current state instead. Only use this when the operator positively selects a valid event/action or when a gated Done When condition is actually met. For durable gated states, user-provided details are not enough; do not send NEXT until the required system_create/system_update/system_delete tool has succeeded or current run evidence already shows the Done When condition is met. Operator actions and choices are not generic continuation events; do not use this for generic next/continue to select an operator action, even if only one operator action is currently valid. Do not use this when the operator explicitly says they have not chosen, selected, asked for, or used the available action. Skip-style events require a positive request to skip. This tool only changes playbook state; it does not retrieve, show, save, create, update, or transform domain entities. When the operator message only selects a playbook action, call this tool without unrelated domain mutation tools such as system_create or system_update. If the operator also asks to find/show/retrieve content, call system_get or system_search before answering.",
      z.object(sendEventInputSchema),
      async (input, toolContext) =>
        handlers.sendEvent({
          ...input,
          conversationId: toolContext.conversationId,
        }),
      {
        nameOverride: "playbook_send_event",
        visibility: "admin",
        sideEffects: "writes",
      },
    ),
  ];
}
