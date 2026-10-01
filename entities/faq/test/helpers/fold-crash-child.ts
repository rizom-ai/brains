import { openFoldStorage, reconcileFold } from "./fold-storage";

const dir = process.argv[2];
const mode = process.argv[3];
if (!dir || (mode !== "before" && mode !== "after"))
  throw new Error("Invalid crash fixture arguments");
const service = await openFoldStorage(dir);
async function pause(): Promise<void> {
  await Bun.write(`${dir}/paused`, mode ?? "");
  // The parent sends SIGKILL: neither catch/restore nor graceful close can run.
  await new Promise<void>(() => {
    setInterval(() => {}, 1000);
  });
}
const update = service.updateEntity.bind(service);
service.updateEntity = async (request): ReturnType<typeof update> => {
  const result = await update({
    ...request,
    options: {
      ...request.options,
      ...(mode === "before" && { beforeWrite: pause }),
    },
  });
  if (mode === "after") await pause();
  return result;
};
// Also intercept the corrected path. The guard lets this same fixture reproduce
// delete-before-merge on the pre-fix service, which has no fold operation.
if ("foldEntity" in service && typeof service.foldEntity === "function") {
  const fold = service.foldEntity.bind(service);
  service.foldEntity = async (request): ReturnType<typeof fold> => {
    const result = await fold({
      ...request,
      options: {
        ...request.options,
        ...(mode === "before" && { beforeWrite: pause }),
      },
    });
    if (mode === "after") await pause();
    return result;
  };
}
await reconcileFold(service);
throw new Error("Crash checkpoint was not reached");
