export function getAgentDiscoveryInstructions(): string {
  return [
    "Agent entities represent saved peer-brain contacts in the local agent directory.",
    "Agent contact records are URL/domain-backed entities: create them with system_create entityType agent and a url source; a raw domain is a valid source, so preserve a bare domain as the bare domain string. If a contact domain was provided earlier in the same conversation and the user then confirms saving or adding it, use that earlier domain instead of asking them to resend it.",
    "Agent lifecycle is tracked with status fields such as discovered, approved, and archived; approval and archive operations are system_update field changes.",
    "Calling remote agents and saving local contact records are separate capabilities. Archived agents are not active call targets.",
  ].join(" ");
}
