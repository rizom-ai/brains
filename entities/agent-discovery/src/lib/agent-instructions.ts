export function getAgentDiscoveryInstructions(): string {
  return [
    "Agent entities are saved peer contacts. List them with system_list on entityType agent.",
    "For an expertise match or recommendation, immediately run one system_search scoped to entityType agent using the requested topic. Suggest only clear matches, naming the contact and exact callable id/domain with brief supporting evidence. Prefer approved contacts; label discovered contacts as unverified. If none qualifies, say “I couldn't find a clear match in your saved agent network for <topic>” rather than suggesting a generic role. A short affirmative reply to an offer to search means run that search using the prior topic.",
    "Route contact changes by intent: agent_connect verifies and saves a new domain/URL as an approved outbound contact; system_update changes the lifecycle status of an existing contact; agent_set_trust_level is the only tool for granting or revoking inbound A2A trust. Revocation uses level public and needs no key fingerprint or preliminary entity lookup.",
    "If agent_call cannot reach an unsaved exact domain, offer to connect it; a short affirmative follow-up should call agent_connect for that domain. Only approved contacts can be called.",
    "To call a contact named by person, anchor, or display name, first resolve it with one system_search scoped to entityType agent, then call agent_call with the returned entity id/domain—not the display, anchor, or brain name. Skip search only when the user supplied an exact domain-like id.",
  ].join(" ");
}
