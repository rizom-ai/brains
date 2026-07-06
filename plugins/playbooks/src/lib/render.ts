/**
 * Render
 *
 * Operator/agent-facing text for playbook runs: per-state guidance, the
 * active-playbook agent context item, and the plugin's registered
 * instructions. Pure functions over run/playbook data — store lookups
 * stay in the plugin and results are passed in.
 */

import type { AgentContextItem } from "@brains/contracts";
import type { PlaybookBody, PlaybookState } from "../entity";
import type { PlaybookRun } from "../run-store";
import {
  formatTransition,
  formatVerifierStatus,
  getBlockedTransitions,
  getValidTransitions,
  sameGoal,
} from "./run-machine";

export function buildStateGuidance(
  run: PlaybookRun,
  body: PlaybookBody,
  state: PlaybookState,
): string {
  const allValidTransitions = getValidTransitions(run, body, state);
  const validTransitions = allValidTransitions.filter(
    (transition) => transition.operatorAction !== true,
  );
  const operatorActions = allValidTransitions.filter(
    (transition) => transition.operatorAction === true,
  );
  const blockedTransitions = getBlockedTransitions(run, body, state);
  const verdict = run.gateVerdicts.find(
    (candidate) =>
      candidate.stateId === state.id &&
      sameGoal(candidate.goal, state.doneWhen),
  );
  return [
    `Current state: ${state.id} (${state.title})`,
    "Instructions:",
    ...state.instructions.map((instruction) => `- ${instruction}`),
    "Done When:",
    ...(state.doneWhen.length > 0
      ? state.doneWhen.map((condition) => `- ${condition}`)
      : ["- none"]),
    "Goal status:",
    verdict
      ? `- ${verdict.met ? "Met" : "Not yet met"}: ${verdict.reason}`
      : "- Not checked yet.",
    "Current-state information rules:",
    "- If this state asks the operator for information, ask the operator for the missing current-run information.",
    "- If the current operator message partially answers the state's prompt, do not repeat the original prompt; ask only for the next missing detail required by the state instructions.",
    "- Do not answer the state's operator-facing prompt from memory, existing durable records, profile data, search, or retrieval tools.",
    "- Setup facts must come from current-run evidence or current operator input, not ambient records.",
    "Event selection rules:",
    "- Blocked events are not valid events; do not call playbook_send_event with a blocked event.",
    "- For gated durable states, operator-provided details are not enough to send NEXT; first complete the required system_create/system_update/system_delete action or use existing current-run evidence that the Done When condition has already been met.",
    "- If the operator explicitly says they have not chosen, selected, asked for, or used one of the available actions, do not send any event.",
    '- Operator actions and choices are not generic continuation events; even if only one operator action is available, generic continuation like "yes", "next", or "continue" is not a valid selection.',
    "- If multiple events are available, ask the operator to pick one labeled action.",
    "- A Skip-style operator action is never a default continuation; send it only when the operator positively selects or asks to skip.",
    "Valid continuation events:",
    ...(validTransitions.length > 0
      ? validTransitions.map((transition) => formatTransition(transition))
      : ["- none"]),
    "Available operator actions:",
    ...(operatorActions.length > 0
      ? operatorActions.map((transition) => formatTransition(transition))
      : ["- none"]),
    "Blocked events:",
    ...(blockedTransitions.length > 0
      ? blockedTransitions.map((transition) => formatTransition(transition))
      : ["- none"]),
  ].join("\n");
}

export function renderAgentContextItem(input: {
  run: PlaybookRun;
  body: PlaybookBody;
  state: PlaybookState;
  playbookTitle: string;
}): AgentContextItem {
  const { run, body, state, playbookTitle } = input;

  const allValidTransitions = getValidTransitions(run, body, state);
  const validTransitions = allValidTransitions.filter(
    (transition) => transition.operatorAction !== true,
  );
  const operatorActions = allValidTransitions.filter(
    (transition) => transition.operatorAction === true,
  );
  const blockedTransitions = getBlockedTransitions(run, body, state);
  const validEvents = validTransitions
    .map((transition) => formatTransition(transition))
    .join("\n");
  const operatorActionEvents = operatorActions
    .map((transition) => formatTransition(transition))
    .join("\n");
  const blockedEvents = blockedTransitions
    .map((transition) => formatTransition(transition))
    .join("\n");
  const doneWhen = state.doneWhen
    .map((condition) => `- ${condition}`)
    .join("\n");
  const completedStates = run.completedStates
    .map((stateId) => `- ${stateId}`)
    .join("\n");
  const requiredDetails = state.requiredDetails
    .map((detail) => `- ${detail}`)
    .join("\n");
  const goalStatus = formatVerifierStatus(run, state);

  return {
    id: run.id,
    source: "active-playbook",
    title: `${playbookTitle} — state: ${state.title}`,
    content: `Current playbook: ${playbookTitle}
Run ID: ${run.id}
Current state title: ${state.title}
Current state id (tool use only): ${state.id}
${state.prompt ? `Operator-facing prompt: ${state.prompt}\n` : ""}
For current-conversation playbook tools, omit runId and let the runtime infer the active run; only include runId when a tool explicitly asks after an ambiguity error.
When you call playbook_send_event, pass fromState set to the current state id shown above; if the run has advanced past that state in the meantime, the event is rejected as stale instead of being applied to the wrong state.
Treat this current state as the source of truth. Do not redo completed states or ask for evidence already captured; ask only for what is missing in the current state.
Do not mention raw playbook state IDs to the operator; use the state title or natural-language task description instead.
Avoid state-machine phrasing like stage, state, or run progress in operator-facing chat; describe the task or outcome in natural language instead.
Call playbook tools silently; never write tool names like playbook_status or playbook_send_event in operator-facing text.
After meaningful tool actions, refresh playbook_status before your final answer when the run may have advanced, then end the turn with the next immediate question or action for the current state. If runtime evidence already advanced the run, do not send an extra NEXT for the new state.
If the immediately prior assistant turn completed a confirmed create/update action and the operator now asks for playbook-related next-step work or provides details for the likely next step, call playbook_status before any non-playbook domain tool so the runtime can apply satisfied gated transitions first.
If exactly one non-operator continuation event is available and the operator clearly accepts it, send that event instead of starting the playbook again. If the current state has exactly one non-operator continuation event, its Done When has already been satisfied by runtime evidence, and the operator asks for the next playbook task, names an action from the next task, names the continuation target, or provides the requested work/details for the continuation target, send the continuation event before doing the requested next-task work. Operator actions and choices are not generic continuation events; even if only one operator action is available, generic continuation like "yes", "next", or "continue" is not a valid selection. If multiple events are available, ask the operator to pick one labeled action. If the operator explicitly says they have not chosen, selected, asked for, or used one of the available actions, do not send any event.
A Skip-style operator action is never a default continuation. Send a Skip event only when the operator positively selects or asks to skip.
If the operator names or selects a valid event label or operator action (for example, "Use the X action"), call playbook_send_event for that matching event before doing related work or answering. Do not ask the operator for the raw event code when a matching labeled action is available; translate the label to its event yourself. If the operator message only selects the playbook action, do not also call unrelated domain mutation tools such as system_create or system_update in the same turn.
A playbook event does not replace ordinary domain tools requested in the same operator message. If the operator also asks to find, show, retrieve, save, create, update, or transform something, call the relevant non-playbook tool before the final answer; do not claim that work happened from conversation memory, playbook evidence, or a playbook event alone. For find/show/retrieve requests, system_get or system_search is mandatory in the same turn even when you also send a playbook event.
After a playbook event advances the run, call playbook_status and answer from the refreshed current state. If playbook_send_event or playbook_status returns currentState.prompt, use that prompt as the final answer for the next step unless the same operator message answers or partially answers that prompt, or includes a concrete request with the necessary content and target details for the new state. If the same operator message answers partially, ask only for the next missing detail required by the state instructions. If the same operator message includes a concrete request, satisfy it in the same turn instead of waiting for another message. Do not infer missing setup details from memory or existing profile data just because the event reached a setup state.
If the operator gives an ambiguous continuation like 'go ahead' after you offered a next playbook action, continue that offered action or ask which option they mean; do not start unrelated maintenance tasks.
Do not set arbitrary current states or claim a state is complete yourself. Advance by calling playbook_send_event with a valid event; the runtime goal check decides whether gated transitions are allowed.
Treat setup facts as current-run evidence: unless the operator provided them in this run or they appear in active-run evidence, do not fill missing playbook requirements from ambient memory or existing durable records.
When the current playbook state asks the operator for information, ask the operator; do not answer the prompt yourself from memory, knowledge search, or existing durable records. If the current operator message appears to answer the current state's operator-facing prompt, use all relevant details in that message as current-run information, then follow the state instructions: act when its requirements are satisfied, or ask only for the next missing required detail instead of repeating the same prompt. If the message only partially satisfies the current state's listed requirements, do not call unrelated durable mutation tools such as system_create or system_update for that state yet; ask for the next missing required detail. If the operator explicitly selects a valid event or operator action such as Skip, send that event instead of asking for the missing information.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts. Runtime evidence from those actions is attached to the active run automatically where supported.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Completed states:
${completedStates || "- none"}

State instructions:
${state.instructions.map((instruction) => `- ${instruction}`).join("\n")}

Required details:
${requiredDetails || "- none"}

Done when:
${doneWhen || "- none"}

Goal status:
${goalStatus}

Valid continuation events:
${validEvents || "- none"}

Available operator actions:
${operatorActionEvents || "- none"}

Blocked events:
${blockedEvents || "- none"}`,
    provenance: {
      playbookId: run.playbookId,
      runId: run.id,
      currentState: run.currentState,
      validEvents: validTransitions.map((transition) => transition.event),
      operatorActions: operatorActions.map((transition) => transition.event),
    },
  };
}

export function buildInstructions(
  lifecycle: Record<string, { playbookId: string; trigger: string }>,
): string {
  const lifecycleSummary = Object.entries(lifecycle)
    .map(
      ([id, config]) =>
        `- ${id}: playbookId=${config.playbookId}, trigger=${config.trigger}`,
    )
    .join("\n");

  return `When the operator asks to start a configured playbook or lifecycle, call playbook_start with the configured playbookId and lifecycle before continuing. If the operator names a playbook by title and no configured lifecycle entry is listed below, still call playbook_start with the stable slug/id form when known instead of claiming the playbook is unavailable without trying the tool.
When active-playbook context is present, follow its current state instructions, Done When conditions, valid events, and operating guidance.
If the recent conversation involved a playbook and the operator asks what is next, what to do next, whether setup is done, or a similar progress question, call playbook_status before answering and use the returned run status/current state as source of truth.
A playbook event does not replace ordinary domain tools requested in the same operator message; if the operator also asks to find, show, retrieve, save, create, update, or transform something, call the relevant non-playbook tool before the final answer.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Configured lifecycle playbooks:
${lifecycleSummary || "- none"}`;
}
