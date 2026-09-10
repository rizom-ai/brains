import { expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

interface Issue {
  number: number;
  title: string;
  pull_request?: object;
}

async function notify(issues: Issue[]): Promise<{
  create: () => Promise<void>;
  update: () => Promise<void>;
  createComment: () => Promise<void>;
}> {
  const workflow = await readFile(
    join(
      import.meta.dir,
      "../../../.github/workflows/directory-sync-import-soak.yml",
    ),
    "utf8",
  );
  const script = workflow.split("script: |\n")[1];
  if (!script) throw new Error("Missing soak failure notification script");
  const api = {
    listForRepo: mock(() => {}),
    create: mock(async () => {}),
    update: mock(async () => {}),
    createComment: mock(async () => {}),
  };
  const paginate = mock(async () => issues);
  const result: unknown = runInNewContext(`(async () => {\n${script}\n})()`, {
    github: { paginate, rest: { issues: api } },
    context: {
      serverUrl: "https://github.com",
      repo: { owner: "rizom-ai", repo: "brains" },
      runId: 123,
    },
  });
  await result;
  expect(paginate).toHaveBeenCalledWith(api.listForRepo, {
    owner: "rizom-ai",
    repo: "brains",
    state: "open",
    creator: "github-actions[bot]",
    sort: "created",
    direction: "asc",
    per_page: 100,
  });
  return api;
}

it("creates a tracking issue when no matching open issue exists", async () => {
  const api = await notify([
    { number: 1, title: "Unrelated issue" },
    {
      number: 2,
      title: "Directory sync nightly soak failed",
      pull_request: {},
    },
  ]);
  expect(api.create).toHaveBeenCalledWith({
    owner: "rizom-ai",
    repo: "brains",
    title: "Directory sync nightly soak failed",
    body: "The nightly directory-sync import soak failed.\n\nRun: https://github.com/rizom-ai/brains/actions/runs/123",
  });
  expect(api.createComment).not.toHaveBeenCalled();
});

it.each([
  "Directory sync nightly soak failed",
  "Directory sync nightly soak failed (34099697219)",
])("reuses the open tracking issue: %s", async (title) => {
  const api = await notify([{ number: 231, title }]);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.update).toHaveBeenCalledWith({
    owner: "rizom-ai",
    repo: "brains",
    issue_number: 231,
    title: "Directory sync nightly soak failed",
  });
  expect(api.createComment).toHaveBeenCalledWith({
    owner: "rizom-ai",
    repo: "brains",
    issue_number: 231,
    body: "The nightly directory-sync import soak failed.\n\nRun: https://github.com/rizom-ai/brains/actions/runs/123",
  });
});
