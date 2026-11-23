import {
  DriveClient,
  MemoryVault,
  SyncEngine,
  memoryStateStore,
  type SyncReport,
} from "../../src/engine";
import {
  openBrain,
  PASSWORD,
  READ_ONLY_PASSWORD,
  USERNAME,
  type TestBrain,
} from "./brain";

export interface Synced {
  brain: TestBrain;
  vault: MemoryVault;
  store: ReturnType<typeof memoryStateStore>;
  engine: SyncEngine;
  /** A second device: its own vault and state, on the same brain. */
  device(): Synced;
}

function engineFor(
  brain: TestBrain,
  password = PASSWORD,
): Omit<Synced, "brain" | "device"> {
  const vault = new MemoryVault();
  const store = memoryStateStore();
  const drive = new DriveClient(
    { address: "https://brain.example", username: USERNAME, password },
    // Through the brain each time, so a test can take the brain away.
    (request) => brain.fetch(request),
  );
  const engine = new SyncEngine({
    vault,
    drive,
    store,
    now: (): Date => new Date(2026, 10, 22, 9, 30, 15),
  });
  return { vault, store, engine };
}

/** A brain and a vault the plugin has not synced yet. */
export async function fresh(
  options: { readOnly?: boolean } = {},
): Promise<Synced> {
  const brain = await openBrain();
  const synced: Synced = {
    brain,
    ...engineFor(brain, options.readOnly ? READ_ONLY_PASSWORD : PASSWORD),
    device: () => ({ ...synced, ...engineFor(brain) }),
  };
  return synced;
}

/** Say yes to the first sync, as the person does when the plugin asks. */
export async function connect(synced: Synced): Promise<SyncReport> {
  const planned = await synced.engine.sync();
  if (planned.status !== "first-sync") return planned;
  return synced.engine.applyFirstSync();
}

/** An entry's file as the brain serves it on the drive, or nothing. */
export async function stored(
  synced: Synced,
  id: string,
  type = "note",
): Promise<string | undefined> {
  const entity = await synced.brain.get(type, id);
  if (!entity) return undefined;
  const path = type === "note" ? `${id}.md` : `${type}/${id}.md`;
  const response = await synced.brain.fetch({
    url: `https://brain.example/dav/${path.split("/").map(encodeURIComponent).join("/")}`,
    method: "GET",
    headers: {
      Authorization: `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`,
      "X-Brain-Sync": "1",
    },
  });
  return response.status === 200
    ? new TextDecoder().decode(response.body)
    : undefined;
}
