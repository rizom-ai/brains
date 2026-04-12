import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireEnv } from "./helpers";

const privateKey = requireEnv("KAMAL_SSH_PRIVATE_KEY");

let normalized = privateKey.replace(/\r\n/g, "\n").replace(/\\n/g, "\n");
if (!normalized.endsWith("\n")) {
  normalized += "\n";
}

const sshDir = join(process.env["HOME"] ?? "/root", ".ssh");
mkdirSync(sshDir, { recursive: true });
writeFileSync(join(sshDir, "id_ed25519"), normalized, {
  encoding: "utf8",
  mode: 0o600,
});
