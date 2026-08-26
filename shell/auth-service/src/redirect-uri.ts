function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "[::1]" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function redirectUriMatches(
  registeredRedirectUri: string,
  requestedRedirectUri: string,
): boolean {
  if (registeredRedirectUri === requestedRedirectUri) return true;

  const registered = parseUrl(registeredRedirectUri);
  const requested = parseUrl(requestedRedirectUri);
  if (!registered || !requested) return false;

  if (
    !isLoopbackHost(registered.hostname) ||
    !isLoopbackHost(requested.hostname)
  ) {
    return false;
  }

  return (
    registered.protocol === requested.protocol &&
    registered.port === requested.port &&
    loopbackPathMatches(registered.pathname, requested.pathname) &&
    registered.search === requested.search &&
    registered.hash === requested.hash
  );
}

function loopbackPathMatches(
  registeredPath: string,
  requestedPath: string,
): boolean {
  return (
    registeredPath === requestedPath ||
    registeredPath === `${requestedPath}/debug` ||
    requestedPath === `${registeredPath}/debug`
  );
}

export function hasMatchingRedirectUri(
  registeredRedirectUris: string[],
  requestedRedirectUri: string,
): boolean {
  return registeredRedirectUris.some((registeredRedirectUri) =>
    redirectUriMatches(registeredRedirectUri, requestedRedirectUri),
  );
}

/**
 * RFC 8252 section 7.3: a native client cannot know which loopback port will be
 * free, so it registers the redirect URI without a port and the authorization
 * server ignores the port when matching. Claude Code's client ID metadata
 * document declares "http://localhost/callback" and then connects on whatever
 * port it managed to bind.
 *
 * Host substitution is deliberately not allowed here: a URI registered for
 * localhost does not match one requested for 127.0.0.1. Only the port is
 * dynamic.
 */
export function matchesLoopbackDynamicPort(
  registeredRedirectUri: string,
  requestedRedirectUri: string,
): boolean {
  const registered = parseUrl(registeredRedirectUri);
  const requested = parseUrl(requestedRedirectUri);
  if (!registered || !requested) return false;

  // Only an HTTP registration that truly omits the port opts into a dynamic
  // one. URL.port normalizes an explicit default port (":80") to an empty
  // string, so inspect the original authority as well.
  if (
    registered.protocol !== "http:" ||
    registered.port !== "" ||
    hasExplicitPort(registeredRedirectUri)
  ) {
    return false;
  }

  if (
    !isLoopbackHost(registered.hostname) ||
    !isLoopbackHost(requested.hostname)
  ) {
    return false;
  }

  return (
    registered.protocol === requested.protocol &&
    registered.hostname.toLowerCase() === requested.hostname.toLowerCase() &&
    registered.pathname === requested.pathname &&
    registered.search === requested.search &&
    registered.hash === requested.hash
  );
}

/**
 * Redirect URI matching for client ID metadata documents. These clients are
 * self-asserted rather than registered, so matching stays exact apart from the
 * loopback port rule above.
 */
export function hasMatchingClientMetadataRedirectUri(
  registeredRedirectUris: string[],
  requestedRedirectUri: string,
): boolean {
  return registeredRedirectUris.some(
    (registeredRedirectUri) =>
      registeredRedirectUri === requestedRedirectUri ||
      matchesLoopbackDynamicPort(registeredRedirectUri, requestedRedirectUri),
  );
}

function hasExplicitPort(value: string): boolean {
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/iu.exec(value)?.[1];
  if (!authority) return false;

  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  if (hostAndPort.startsWith("[")) {
    const bracketEnd = hostAndPort.indexOf("]");
    return bracketEnd !== -1 && hostAndPort[bracketEnd + 1] === ":";
  }
  return hostAndPort.includes(":");
}
