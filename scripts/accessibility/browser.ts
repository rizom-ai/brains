import { evaluatePage } from "../console-visual/page";

/** The Chrome backend repo browser scripts spawn; root and CI runs need Chrome's sandbox off. */
export function chromeBackend(executablePath: string): Bun.WebView.Backend {
  const argv =
    process.getuid?.() === 0 || process.env["CI"] === "true"
      ? ["--no-sandbox", "--disable-dev-shm-usage"]
      : [];
  return {
    type: "chrome",
    url: false,
    path: executablePath,
    ...(argv.length > 0 ? { argv } : {}),
  };
}

/** Resolves once the DOM has not changed for a second, or after 15 seconds. */
export async function waitForQuietDom(page: Bun.WebView): Promise<void> {
  await evaluatePage(
    page,
    () =>
      new Promise<void>((resolve) => {
        const finish = (): void => {
          observer.disconnect();
          clearTimeout(quiet);
          clearTimeout(cap);
          resolve();
        };
        let quiet = setTimeout(finish, 1_000);
        const cap = setTimeout(finish, 15_000);
        const observer = new MutationObserver(() => {
          clearTimeout(quiet);
          quiet = setTimeout(finish, 1_000);
        });
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }),
  );
}
