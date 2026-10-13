import { openCaptureStorage } from "./capture-storage";
const dir = process.argv[2];
const checkpoint = process.argv[3];
const targetId = process.argv[4];
if (!dir) throw new Error("Missing fixture directory");
async function pause(): Promise<void> {
  await Bun.write(`${dir}/paused`, "capture paused");
  await new Promise<void>(() => {
    setInterval(() => {}, 1000);
  });
}
const fixture = await openCaptureStorage(dir, {
  ...(checkpoint === "before-classify" && { classify: pause }),
  ...(targetId && { targetId }),
});
const apply = fixture.service.applyEntityMutationOnce.bind(fixture.service);
fixture.service.applyEntityMutationOnce = async (
  input,
): ReturnType<typeof apply> => {
  if (checkpoint === "before-write" && input.operation !== "none") {
    input.request.options = { ...input.request.options, beforeWrite: pause };
  }
  const result = await apply(input);
  if (checkpoint === "after-write") await pause();
  return result;
};
await fixture.process();
throw new Error("Expected parent to terminate the fixture");
