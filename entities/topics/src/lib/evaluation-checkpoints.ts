import type { Checkpoint, TopicCheckpoints } from "./ranked-topic-extraction";

/** Eval-local data, never the installed maintenance checkpoints. */
function checkpoint<T>(): Checkpoint<T> {
  const entries = new Map<
    string,
    { value: T; createdAt: Date; updatedAt: Date }
  >();
  const put = (key: string, value: T): void => {
    const now = new Date();
    entries.set(key, {
      value: structuredClone(value),
      createdAt: entries.get(key)?.createdAt ?? now,
      updatedAt: now,
    });
  };
  return {
    get: (key) =>
      Promise.resolve(structuredClone(entries.get(key)?.value ?? null)),
    set: (key, value): Promise<void> => {
      put(key, value);
      return Promise.resolve();
    },
    setIfNotExists: (key, value): Promise<boolean> => {
      if (entries.has(key)) return Promise.resolve(false);
      put(key, value);
      return Promise.resolve(true);
    },
    compareAndSet: (key, expected, value): Promise<boolean> => {
      if (
        !entries.has(key) ||
        JSON.stringify(entries.get(key)?.value) !== JSON.stringify(expected)
      )
        return Promise.resolve(false);
      put(key, value);
      return Promise.resolve(true);
    },
    delete: (key) => Promise.resolve(entries.delete(key)),
    list: (options = {}) =>
      Promise.resolve(
        [...entries.entries()]
          .filter(
            ([key]) =>
              (!options.keyPrefix || key.startsWith(options.keyPrefix)) &&
              (!options.afterKey || key > options.afterKey),
          )
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .slice(0, options.limit)
          .map(([key, record]) => ({ key, ...structuredClone(record) })),
      ),
  };
}

export function evaluationCheckpoints(): TopicCheckpoints {
  return { votes: checkpoint(), failures: checkpoint(), leases: checkpoint() };
}
