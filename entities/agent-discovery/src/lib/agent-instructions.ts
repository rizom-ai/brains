export function getAgentDiscoveryInstructions(): string {
  return [
    "Agent entities represent saved peer-brain contacts in the local agent directory.",
    "Agent contact records are verified A2A peer contacts: connect/save them with agent_connect and a url source; a raw domain is a valid source, so preserve a bare domain as the bare domain string. agent_connect verifies the remote Agent Card and saves the contact for review; approval remains a separate status update.",
    "Agent lifecycle is tracked with status fields such as discovered, approved, and archived; approval and archive operations are system_update field changes.",
    "Calling remote agents and saving local contact records are separate capabilities. Archived agents are not active call targets.",
  ].join(" ");
}
