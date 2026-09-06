import { chmod, symlink, writeFile } from "node:fs/promises";
const cwd = "/app/brain-data";
async function git(args: string[]): Promise<void> {
  const child = Bun.spawn(["git", "-c", `safe.directory=${cwd}`, ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  const [code, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`Git fixture setup failed: ${diagnostic}`);
}
await git(["init", "-b", "main"]);
await git(["config", "user.name", "Docker Backup Rehearsal"]);
await git(["config", "user.email", "backup@example.invalid"]);
await writeFile(`${cwd}/.gitignore`, "ignored.bin\n");
await writeFile(`${cwd}/note.md`, "# Original note\n");
await git(["add", "."]);
await git(["commit", "-m", "fixture"]);
await git(["init", "--bare", "/tmp/content.git"]);
await git(["remote", "add", "origin", "/tmp/content.git"]);
await git(["push", "--set-upstream", "origin", "main"]);
await git(["branch", "local-only"]);
await writeFile(`${cwd}/stash.md`, "Retain this stash\n");
await git(["add", "stash.md"]);
await git(["stash", "push", "-m", "saved fixture work"]);
await writeFile(`${cwd}/note.md`, "# Staged note\n");
await git(["add", "note.md"]);
await writeFile(`${cwd}/note.md`, "# Unstaged note\n");
await writeFile(`${cwd}/ignored.bin`, new Uint8Array([255, 0, 128]));
await writeFile(`${cwd}/untracked.bin`, new Uint8Array([0, 1, 255]));
await writeFile(`${cwd}/execute.sh`, "#!/bin/sh\nexit 0\n");
await chmod(`${cwd}/execute.sh`, 0o755);
await symlink("note.md", `${cwd}/note-link`);
