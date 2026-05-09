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
