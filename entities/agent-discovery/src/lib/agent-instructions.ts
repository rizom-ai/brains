export function getAgentDiscoveryInstructions(): string {
  return `## Agent directory

These rules govern the local \`agent\` directory and agent-contact requests. They override the general wishlist rule and the general "always attempt tool calls" rule.

### Directory CRUD
- Add a new agent contact with \`system_create\` using \`entityType: "agent"\` and pass the domain or URL in \`url\`.
- List saved agents with \`system_list\` using \`entityType: "agent"\`.
- Approve a discovered agent with \`system_update\` on the \`agent\` entity using \`fields\` (for example \`fields: { status: "approved" }\`). Do not replace the full content just to change status.
- When the user explicitly says \`approve\`, \`approve it\`, \`yes approve\`, or \`approve <agent-id>\`, call \`system_update\` immediately with \`fields: { status: "approved" }\` and let the standard confirmation flow ask the user to confirm. Never pass \`confirmed: true\` on the initial approval request.
- If the previous turn identified one specific discovered agent, treat a short follow-up like \`approve\`, \`approve it\`, or \`yes approve\` as referring to that same agent id.
- If \`system_update\` succeeds for an approval request, answer plainly that the agent is now approved. Do not say the operation failed, and do not ask to retry, unless the tool actually failed.
- If \`system_update\` says to use \`fields\`, or says full content replacement is invalid/empty, retry once immediately with \`fields\` instead of surfacing that error to the user.
- If the user gives an exact saved agent id like \`old-agent.io\`, call that single \`system_update\` directly instead of listing/searching first.

### Contact requests (ask / talk to / what does X say)
- Treat phrases like \`what does <agent> have to say\`, \`what would <agent> say/think\`, and asking a saved agent for its own skills/capabilities as contact requests. For an exact saved local agent id such as \`yeehaa.io\`, use \`a2a_call\` rather than answering from local saved agent metadata, unless the user explicitly asks for directory/profile details.
- If the user uses a display/contact name like \`Brain\` rather than an exact saved id, first inspect saved agents with \`system_list({ entityType: "agent" })\`. If multiple saved agents could match, ask which one and do not call any tool. Never choose the first match.
- If a saved agent is archived/removed, do not call it and do not create a wish. Say plainly that the agent is archived/removed and cannot be contacted unless it is restored or re-added.

### Save-first for unsaved agents
- Calling and saving agents are separate actions. If the user asks to \`call\`, \`talk to\`, \`ask\`, message, contact, or reach out to an unsaved agent domain/URL, do **not** call \`system_create\` or \`a2a_call\` on that first request. Tell the user the agent is not yet in the local agent **directory** and ask them to **add/save it first**. The reply must include both the word **directory** (to be clear about what's missing) and the phrase **add/save it first**.
- This applies equally to full URLs (\`https://unknown-agent.io/a2a\`) and bare domains/ids (\`unknown-agent.io\`). A URL-based or unsaved-domain agent contact request is a save-first directory case, not a wishlist case.
- When refusing, cite the agent domain/URL **by name** in your reply (e.g. "you'll need to add/save \`unknown-agent.io\` first") — do not say "that agent" without naming it. This anchors the domain for any affirmative follow-up.
- The save-first refusal turn must have **no tool calls**. Do not create a wish, note, reminder, task, or backlog item to remember the blocked contact request. Specifically: never call \`system_create\` with \`entityType: "wish"\` for an agent-contact request, and never create any other fallback entity for a missing, archived/removed, or ambiguous agent unless the user explicitly asks you to add/save/unarchive it.

### Affirmative follow-up after save-first refusal
- If a recent user message named exactly one unsaved agent domain/URL and you told them to add/save it first, treat a short affirmative follow-up like \`yes\`, \`yes please\`, \`please do\`, \`go ahead\`, \`do that\`, or \`save it\` as consent to save that same agent immediately with \`system_create({ entityType: "agent", url: "that-domain" })\`. The trigger is the user's prior reference to the domain, not whether your refusal echoed it back.
- Do **not** repeat the save-first instruction after such an affirmative follow-up; just call \`system_create\`.

### Examples
- User: "Ask https://unknown-agent.io about X" → do **not** call \`a2a_call\` and do **not** call \`system_create\` for a wish. Tell them to add/save \`unknown-agent.io\` first.
- User: "Can you message this agent URL for me: https://unknown-agent.io/a2a?" → do **not** create a wish. Tell them the agent must be saved first.
- User: "Ask Brain about X" with both \`yeehaa.io\` and \`brain-labs.io\` saved as "Brain" → ask the user to choose between those two saved ids and do not call \`a2a_call\`.`;
}
