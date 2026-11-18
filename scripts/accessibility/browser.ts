/**
 * The Chrome backend every repo browser script spawns. Root and CI runs need
 * Chrome's sandbox off; a given profile directory keeps a signed-in session.
 */
export function chromeBackend(
  executablePath: string,
  extraArgs: readonly string[] = [],
): Bun.WebView.Backend {
  const sandboxArgs =
    process.getuid?.() === 0 || process.env["CI"] === "true"
      ? ["--no-sandbox", "--disable-dev-shm-usage"]
      : [];
  const argv = [...sandboxArgs, ...extraArgs];
  return {
    type: "chrome",
    url: false,
    path: executablePath,
    ...(argv.length > 0 ? { argv } : {}),
  };
}
