import {
  requireEnv,
  runResolveMissingImages,
  writeGitHubOutput,
} from "./helpers";

// The Build workflow's resolve step — the logic lives in @rizom/ops; this
// pilot repo only supplies its own paths and repository.
await runResolveMissingImages({
  rootDir: process.cwd(),
  imageRepository: `ghcr.io/${requireEnv("GITHUB_REPOSITORY")}`,
  writeOutput: writeGitHubOutput,
});
