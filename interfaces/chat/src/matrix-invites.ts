/** The localpart every brain's bot uses, so a peer's bot is `@_brain:<peer>`. */
const BRAIN_BOT_LOCALPART = "_brain";

/** The slice of the auth backend that says how far a peer brain is trusted. */
export interface MatrixPeerTrust {
  getA2APeerTrust(
    domain: string,
  ): Promise<{ grantedLevel: "trusted" | "public" } | undefined>;
}

export interface MatrixInvite {
  roomID: string;
  inviter: string | undefined;
  isDirect: boolean;
}

/**
 * Which invites the brain's bot accepts. A direct invite is how a person
 * opens a DM, accepted while DMs are allowed. A room invite comes only from
 * a peer brain's bot for the room that brain keeps for this one, accepted
 * when this brain trusts the peer's domain at `trusted` at that moment, so
 * a peer trusted after the bot started is honored without a restart.
 */
export function matrixInviteDecision(options: {
  allowDMs: boolean;
  /** Read per invite: auth binds after the interface registers. */
  peerTrust: () => MatrixPeerTrust | undefined;
}): (invite: MatrixInvite) => Promise<boolean> {
  return async (invite): Promise<boolean> => {
    if (!invite.inviter) return false;
    if (invite.isDirect) return options.allowDMs;
    const [localpart, domain] = splitUserId(invite.inviter);
    if (localpart !== BRAIN_BOT_LOCALPART || !domain) return false;
    const trust = await options.peerTrust()?.getA2APeerTrust(domain);
    return trust?.grantedLevel === "trusted";
  };
}

function splitUserId(userId: string): [string, string | undefined] {
  const separator = userId.indexOf(":");
  return separator < 0
    ? [userId.slice(1), undefined]
    : [userId.slice(1, separator), userId.slice(separator + 1)];
}
