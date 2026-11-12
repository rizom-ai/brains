import {
  defineDaemon,
  defineInterface,
  defineRoute,
  z,
} from "@rizom/brain/interfaces";

const tally = z.object({
  count: z.string().transform(Number),
  label: z.string().default("ready"),
});

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const interfaceSetupTypeCanary = defineInterface(
  {
    id: "interface-setup-canary",
    config: z.object({ prefix: z.string().default("tally") }),
    // The header fixes the state before any behavior slot is checked.
    setup: ({ config, lifecycle, runtimeState }) => {
      const tallies = runtimeState({ namespace: "tallies", schema: tally });
      lifecycle.onCleanup(async () => {
        await tallies.clear({ keyPrefix: config.prefix });
      });
      return { prefix: config.prefix, tallies };
    },
  },
  {
    // Behavior slots read that state in whatever order they are written.
    daemons: ({ state }) => [
      defineDaemon({
        id: "tally-feed",
        // The slot carries the capabilities; a daemon's run is given its call.
        async run({ signal, health }) {
          await state.tallies.set(`${state.prefix}:started`, { count: "1" });
          health.ready();
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      }),
      defineDaemon({
        id: "no-capabilities",
        // @ts-expect-error A daemon's run is given no jobs; its slot is.
        async run({ jobs }) {
          void jobs;
        },
      }),
    ],
    routes: ({ state }) => [
      defineRoute({
        method: "POST",
        path: "/interface-setup-canary/tally",
        security: { kind: "public" },
        response: z.object({ count: z.number(), label: z.string() }),
        async handle() {
          const key = `${state.prefix}:visits`;
          // Writes take the schema's input; reads return its parsed output.
          await state.tallies.set(key, { count: "1" });
          const read = await state.tallies.get(key);
          if (!read) return { count: 0, label: "empty" };
          const rejected = (): void => {
            // @ts-expect-error Writes take the schema's input, not its transformed output.
            void state.tallies.set(key, { count: 1 });
            // @ts-expect-error Reads return the schema's parsed output.
            const wrong: string = read.count;
            void wrong;
            // @ts-expect-error A store's namespace is fixed when setup asks for it.
            void state.tallies.namespace;
          };
          void rejected;
          return read;
        },
      }),
      defineRoute({
        method: "GET",
        path: "/interface-setup-canary/no-state",
        security: { kind: "public" },
        response: z.object({}),
        // @ts-expect-error A route's handler is given its call, not the slot's state.
        handle: ({ state: own }) => {
          void own;
          return {};
        },
      }),
    ],
  },
);

export function misplacedRoutes(): void {
  defineInterface({
    id: "misplaced",
    config: z.object({}),
    // @ts-expect-error Behavior is the second argument, not part of the header.
    routes: () => [],
  });
}
