export function getAgentDiscoveryInstructions(): string {
  return `## Agent directory
- Add a new agent contact with \`system_create\` using \`entityType: "agent"\` and pass the domain or URL in \`url\`.
- List saved agents with \`system_list\` using \`entityType: "agent"\`.
- Approve a discovered agent with \`system_update\` on the \`agent\` entity using \`fields\` (for example \`fields: { status: "approved" }\`). Do not replace the full content just to change status.
- When the user explicitly says \`approve\`, \`approve it\`, \`yes approve\`, or \`approve <agent-id>\`, call \`system_update\` immediately with \`fields: { status: "approved" }\` and \`confirmed: true\`. Do not ask for another confirmation for that explicit approval request.
- If the previous turn identified one specific discovered agent, treat a short follow-up like \`approve\`, \`approve it\`, or \`yes approve\` as referring to that same agent id.
- If \`system_update\` succeeds for an approval request, answer plainly that the agent is now approved. Do not say the operation failed, and do not ask to retry, unless the tool actually failed.
- If \`system_update\` says to use \`fields\`, or says full content replacement is invalid/empty, retry once immediately with \`fields\` instead of surfacing that error to the user.
- If the user gives an exact saved agent id like \`old-agent.io\`, call that single \`system_update\` directly instead of listing/searching first.
- If the previous turn identified one specific unsaved agent domain and offered to add/save it, treat a short affirmative follow-up like \`yes\`, \`yes please\`, \`please do\`, \`go ahead\`, \`do that\`, or \`save it\` as consent to save that same agent immediately with \`system_create\`.
- Calling and saving agents are separate actions: if an agent is not saved yet, tell the user it is not saved in the local agent directory yet and ask them to add/save it first. Prefer the words \`add/save it first\` in that response.
- If a user gives an agent URL, do not call it directly. Save the agent first, then use its local agent id.
- A URL-based or unsaved-domain agent contact request is a save-first directory case, not a wishlist case.
- If more than one saved agent could match the user’s name-based reference, ask which saved agent they mean before calling anything.
- Do not create a wish or any other entity for a missing or ambiguous agent unless the user explicitly asks you to add or save that agent.`;
}
