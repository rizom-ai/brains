import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGitCredentialEnv } from "../../../src/lib/broker/git-credentials";
import { runGitCommandWithStallTimeout } from "../../../src/lib/broker/git-stall";

/**
 * Phase 4 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The credential mechanism is unit-tested, but "the header is well-formed" is
 * not the same claim as "a private remote actually lets us in". This drives
 * clone, fetch, and push against a real Git server over TLS that rejects
 * anyone who does not authenticate.
 */

const LINUX = process.platform === "linux";
const TOKEN = "ghp_liveremote0123456789";
const EXPECTED_AUTH = `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;

let scratch: string | undefined;
let server: { stop(closeActiveConnections?: boolean): void } | undefined;

interface Fixture {
  remoteUrl: string;
  projectRoot: string;
  /** Every Authorization header the server was offered, in order. */
  offered: Array<string | null>;
}

async function run(
  command: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<{ code: number; output: string }> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: `${out}${err}` };
}

/** A self-signed certificate, so the transport is real rather than simulated. */
async function selfSignedCert(
  dir: string,
): Promise<{ cert: string; key: string }> {
  const certPath = join(dir, "server.crt");
  const keyPath = join(dir, "server.key");
  const { code, output } = await run(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ],
    dir,
  );
  if (code !== 0) throw new Error(`openssl failed: ${output}`);
  return {
    cert: await Bun.file(certPath).text(),
    key: await Bun.file(keyPath).text(),
  };
}

/**
 * `git http-backend` behind Basic auth.
 *
 * The smart HTTP protocol is what a real private remote speaks, and push in
 * particular has no dumb-protocol equivalent — so this bridges CGI rather than
 * faking the wire.
 */
async function authenticatedRemote(): Promise<Fixture> {
  scratch = await mkdtemp(join(tmpdir(), "authenticated-remote-"));
  const projectRoot = join(scratch, "remotes");
  await mkdir(projectRoot, { recursive: true });
  await run(["git", "init", "--bare", "content.git"], projectRoot);
  await run(
    ["git", "config", "http.receivepack", "true"],
    join(projectRoot, "content.git"),
  );

  const backend = (
    await run(["git", "--exec-path"], projectRoot)
  ).output.trim();
  const { cert, key } = await selfSignedCert(scratch);
  const offered: Array<string | null> = [];

  const listening = Bun.serve({
    port: 0,
    tls: { cert, key },
    fetch: async (request): Promise<Response> => {
      const authorization = request.headers.get("authorization");
      offered.push(authorization);
      if (authorization !== EXPECTED_AUTH) {
        return new Response("unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="content"' },
        });
      }

      const url = new URL(request.url);
      const body = new Uint8Array(await request.arrayBuffer());
      const child = Bun.spawn([join(backend, "git-http-backend")], {
        cwd: projectRoot,
        stdin: body,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          GIT_PROJECT_ROOT: projectRoot,
          GIT_HTTP_EXPORT_ALL: "1",
          REMOTE_USER: "test",
          REQUEST_METHOD: request.method,
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.replace(/^\?/, ""),
          CONTENT_TYPE: request.headers.get("content-type") ?? "",
          CONTENT_LENGTH: String(body.byteLength),
        },
      });

      const raw = new Uint8Array(
        await new Response(child.stdout).arrayBuffer(),
      );
      const separator = Buffer.from(raw).indexOf("\r\n\r\n");
      const headerText = new TextDecoder().decode(raw.slice(0, separator));
      const headers = new Headers();
      let status = 200;
      for (const line of headerText.split("\r\n")) {
        const [name, ...rest] = line.split(":");
        const value = rest.join(":").trim();
        if (!name || !value) continue;
        if (name.toLowerCase() === "status") {
          status = Number.parseInt(value, 10);
          continue;
        }
        headers.set(name, value);
      }
      return new Response(raw.slice(separator + 4), { status, headers });
    },
  });
  server = listening;

  return {
    remoteUrl: `https://127.0.0.1:${listening.port}/content.git`,
    projectRoot,
    offered,
  };
}

afterEach(async () => {
  server?.stop(true);
  server = undefined;
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe.skipIf(!LINUX)("a private https remote", () => {
  it("clones, fetches, and pushes with an environment-supplied credential", async () => {
    const remote = await authenticatedRemote();
    const checkout = join(scratch ?? "", "checkout");
    // The certificate is generated per run, so verification is switched off
    // for the fixture only — nothing here changes what production sends.
    const credentialEnv = {
      ...buildGitCredentialEnv(remote.remoteUrl, TOKEN),
      GIT_SSL_NO_VERIFY: "1",
    };
    const net = { baseDir: scratch ?? "", timeoutMs: 30_000, credentialEnv };

    await runGitCommandWithStallTimeout(net, [
      "clone",
      remote.remoteUrl,
      checkout,
    ]);

    await writeFile(join(checkout, "note.md"), "authenticated\n");
    await run(["git", "add", "-A"], checkout);
    await run(
      [
        "git",
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-m",
        "authenticated push",
      ],
      checkout,
    );

    await runGitCommandWithStallTimeout({ ...net, baseDir: checkout }, [
      "push",
      "origin",
      "HEAD:refs/heads/main",
    ]);

    // The bare repository is the proof the push landed, not the exit code.
    const landed = await run(
      ["git", "log", "--format=%s", "-1", "main"],
      join(remote.projectRoot, "content.git"),
    );
    expect(landed.output.trim()).toBe("authenticated push");

    await runGitCommandWithStallTimeout({ ...net, baseDir: checkout }, [
      "fetch",
      "origin",
    ]);

    // Every exchange carried the credential; none of them carried it in a URL.
    expect(remote.offered.length).toBeGreaterThan(0);
    expect(remote.offered.every((value) => value === EXPECTED_AUTH)).toBe(true);
  }, 120_000);

  it("is refused, promptly, without a credential", async () => {
    const remote = await authenticatedRemote();
    const checkout = join(scratch ?? "", "anonymous");

    // No token: the builder emits no header, and the server rejects. What
    // matters as much as the failure is that it does not sit waiting for a
    // terminal that is not there.
    const outcome = await runGitCommandWithStallTimeout(
      {
        baseDir: scratch ?? "",
        timeoutMs: 30_000,
        credentialEnv: {
          ...buildGitCredentialEnv(remote.remoteUrl, undefined),
          GIT_SSL_NO_VERIFY: "1",
        },
      },
      ["clone", remote.remoteUrl, checkout],
    ).then(
      () => undefined,
      (error: unknown) => String(error),
    );

    expect(outcome).toBeDefined();
    expect(remote.offered).toContain(null);
  }, 60_000);
});
