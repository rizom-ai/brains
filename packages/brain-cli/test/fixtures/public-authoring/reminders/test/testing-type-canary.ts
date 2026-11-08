import { use } from "@rizom/brain";
import {
  startTestBrain,
  type TestBrain,
  type TestBrainOptions,
  type TestToolResult,
} from "@rizom/brain/testing";
import reminders, { dueCount, fireReminder, reminder } from "../src/index";

const past = "2000-01-01T00:00:00.000Z";

/** What a tool answered, read through every form it takes. */
function describeAnswer(answer: TestToolResult): string {
  if ("needsConfirmation" in answer) return answer.summary;
  if (!answer.success) {
    const code: string | undefined = answer.code;
    return `${code ?? "failed"}: ${answer.error}`;
  }
  const data: unknown = answer.data;
  return JSON.stringify(data);
}

// Included by the standalone and packed typechecks, never run.
export async function testingTypeCanary(): Promise<string> {
  // The brain runs packages configured with use(), as defineBrain does.
  const options: TestBrainOptions = { plugins: [use(reminders)] };
  // @ts-expect-error A definition use() did not configure is refused.
  const unconfigured: TestBrainOptions = { plugins: [reminders] };
  void unconfigured;
  const brain: TestBrain = await startTestBrain(options);

  const added = describeAnswer(
    await brain.tool("reminders_add", { id: "a", content: "A", dueAt: past }),
  );

  // A contract's answer is typed by the contract, and so is the request.
  const due = await brain.request(dueCount, { now: past });
  const count: number = due.status === "answered" ? due.data.count : 0;
  // @ts-expect-error A request the contract refuses does not compile.
  await brain.request(dueCount, { now: 1 });

  // A job's result is typed by its definition.
  const status = await brain.jobs.wait(fireReminder, "job-id");
  const fired: boolean | undefined = status?.result?.fired;
  // @ts-expect-error The result carries only what the job's output declares.
  void status?.result?.missing;

  // Records are typed by their definition, and only read.
  const stored = await brain.entities.get(reminder, "a");
  const done: boolean | undefined = stored?.metadata.done;
  // @ts-expect-error A test reads the brain's records; the packages write them.
  void brain.entities.create;

  const served: Response = await brain.fetch(
    new Request("https://brain.test/reminders/due"),
  );
  await brain.stop();
  return `${added} ${count} ${fired} ${done} ${served.status}`;
}
