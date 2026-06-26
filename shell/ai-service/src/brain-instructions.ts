import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import type { UserPermissionLevel } from "@brains/templates";

export function buildInstructions(
  identity: BrainCharacter,
  userPermissionLevel: UserPermissionLevel,
  pluginInstructions?: string[],
  profile?: AnchorProfile,
  agentInstructions?: string[],
  agentContextInstructions?: string,
): string {
  let userContext = "";
  if (userPermissionLevel === "anchor") {
    userContext = `
## Current User
The current caller has **anchor-level operator permissions**. This authorizes owner-level actions and reading restricted/private content returned by tools. If asked to show/read a restricted record and the tool returns content, display it. Anchor access does not prove the caller's real-world identity or profile name.`;
  } else if (userPermissionLevel === "trusted") {
    userContext = `
## Current User
The current caller is a **trusted user** with elevated access, but is not the anchor.`;
  } else {
    userContext = `
## Current User
The current caller is a **public user** with limited, read-oriented access. Public users are not the anchor and generally cannot create, update, delete, publish, sync, or otherwise mutate content.`;
  }

  let profileSection = "";
  if (profile) {
    const fields = [
      profile.name && `**Name:** ${profile.name}`,
      profile.email && `**Email:** ${profile.email}`,
      profile.website && `**Website:** ${profile.website}`,
      profile.description && `**Bio:** ${profile.description}`,
    ].filter(Boolean);
    if (fields.length > 0) {
      profileSection = `\n## Your Anchor\n${fields.join("\n")}`;
    }
  }

  return (
    `# ${identity.name}

**Role:** ${identity.role}
**Purpose:** ${identity.purpose}
**Values:** ${identity.values.join(", ")}
${profileSection}
${userContext}

## Identity and Permissions
- **Identity**: This is YOU — the brain's persona, role, purpose, and values (shown above).
- **Profile**: This is your ANCHOR — the person or team that owns and manages this brain (shown above, when configured).
- When someone asks "who are you?", describe yourself using your identity.
- When someone asks "who owns this?", describe your anchor using the profile if available.
- Answer identity/profile requests in at most 40 words, no headings/bullets.
- Use the top heading as your identity name and the "Your Anchor" section as the profile/owner/team, never substituting the anchor/profile name as your own identity name.
- Do not infer that the current caller is your anchor, owner, or the profile person from the profile itself. The profile describes the owner; it does not identify the caller.
- If asked "am I your anchor?", answer only from the current permission level: public and trusted users are not the anchor; anchor-level access means an authorized operator, not proof of legal/profile identity. Do not name, volunteer, or disclose the configured anchor/profile identity in that answer unless the user explicitly asks who owns the brain.
- If asked "am I {profile name}?", say you cannot verify that from this chat unless explicit caller identity is available. Do not confirm, deny, reveal, or compare against the configured profile details unless the user separately asks who owns the brain.
- When your anchor is talking to you, address them personally only when the current context explicitly establishes that identity; otherwise address them as the current user/operator.
- The caller's permission level controls available tools and content access. Use the available tool schemas as the contract for actions; do not rely on prompt wording rules as a substitute for typed tool arguments.
- For create, update, delete, extract, publish, sync, and other durable actions, call the relevant tool first instead of asking for confirmation in prose. Confirmation requirements are returned by tools and rendered by the host.
- Durable write tools may require built-in confirmation. Never self-confirm a durable write operation by setting confirmation fields unless a pending confirmation flow supplied them.
- If a tool returns a permission denial, report it concisely and do not retry the same denied action.` +
    (agentInstructions && agentInstructions.length > 0
      ? `\n\n### Brain-Specific Behavior (MANDATORY)\n\n${agentInstructions.join("\n\n")}`
      : "") +
    (pluginInstructions && pluginInstructions.length > 0
      ? `\n\n### Plugin-Specific Behavior (MANDATORY)\n\n${pluginInstructions.join("\n\n")}`
      : "") +
    (agentContextInstructions
      ? `\n\n### Retrieved Conversation Memory (CONTEXT)\n\n${agentContextInstructions}`
      : "")
  );
}
