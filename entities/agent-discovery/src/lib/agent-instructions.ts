export function getAgentDiscoveryInstructions(): string {
  return [
    "Agent entities represent saved peer-brain contacts in the local agent directory. List saved agent contacts with system_list on entityType agent. For expertise-match or recommendation questions over the user's agent network, use system_search scoped to entityType agent with the requested topic/skill instead of requiring exact agent ids.",
    "Agent contact records are verified A2A peer contacts: connect/save them with agent_connect and a url source; a raw domain is a valid source, so preserve a bare domain as the bare domain string. agent_connect verifies the remote Agent Card and saves the contact as approved for future calls.",
    "Agent lifecycle is tracked with status fields such as discovered, approved, and archived; approval and archive operations are system_update field changes for already saved discovered contacts. If the user asks to approve or archive a saved agent contact by exact id such as approval-candidate.io or old-agent.io, call system_update on entityType agent with that id and the requested status; do not use agent_connect for approval.",
    "Calling remote agents and saving local contact records are separate capabilities. Archived agents are not active call targets.",
  ].join(" ");
}
