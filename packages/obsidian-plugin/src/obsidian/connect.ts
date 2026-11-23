/** The Connect request this vault opened, until the brain answers it. */
export interface PendingConnect {
  /** Sent to the brain and handed back: the answer is to this request. */
  state: string;
  /** The brain Connect opened. */
  origin: string;
}

/** The origin of a brain's address as typed, or nothing when it is not one. */
export function originOf(address: string): string | undefined {
  const trimmed = address.trim();
  if (trimmed === "") return undefined;
  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).origin;
  } catch {
    // An address being typed is not one yet: nothing to connect to.
    return undefined;
  }
}

/**
 * The app password in an `obsidian://rizom-brain` link, when the link answers
 * the request this vault opened, for the brain its address still names. A
 * link from anywhere else never changes where the vault syncs.
 */
export function acceptConnect(
  pending: PendingConnect | undefined,
  params: Record<string, string | undefined>,
  address: string,
): { username: string; password: string } | undefined {
  const { state, username, password } = params;
  if (
    pending === undefined ||
    state !== pending.state ||
    username === undefined ||
    username === "" ||
    password === undefined ||
    password === "" ||
    originOf(address) !== pending.origin
  ) {
    return undefined;
  }
  return { username, password };
}
