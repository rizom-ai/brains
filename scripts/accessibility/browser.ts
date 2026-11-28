import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePage } from "../console-visual/page";

const PROFILE_PREFIX = "brains-chrome-";

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Removes the Chrome profiles of processes that have exited. A profile is
 * removed when its process exits, but Chrome writes a few files while it
 * shuts down, so what it left is taken up by the next run.
 */
export function sweepChromeProfiles(
  root: string = tmpdir(),
  running: (pid: number) => boolean = isRunning,
): void {
  for (const name of readdirSync(root)) {
    const pid = Number(name.slice(PROFILE_PREFIX.length).split("-")[0]);
    if (!name.startsWith(PROFILE_PREFIX) || !Number.isInteger(pid)) continue;
    if (running(pid)) continue;
    rmSync(join(root, name), { recursive: true, force: true });
  }
}

let profile: { directory: string } | undefined;

/**
 * The Chrome profile for this process, passed as a WebView's `dataStore`.
 * Without one, Bun gives Chrome a temporary profile of its own and never
 * removes it, about 168 MB a run. One Chrome serves the whole process, so
 * every view shares this directory; it is removed when the process exits.
 */
export function chromeProfile(): { directory: string } {
  if (profile) return profile;
  sweepChromeProfiles();
  const directory = mkdtempSync(
    join(tmpdir(), `${PROFILE_PREFIX}${process.pid}-`),
  );
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  profile = { directory };
  return profile;
}

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
