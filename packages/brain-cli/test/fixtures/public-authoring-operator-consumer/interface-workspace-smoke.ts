import { createBrainTestHarness } from "@rizom/brain/testing";
import {
  defineInterface,
  defineStudioWorkspace,
  defineWorkspaceAction,
} from "@rizom/brain/interfaces";
import { z } from "@rizom/brain/services";

const action = defineWorkspaceAction({
  name: "stop",
  label: "Stop",
  permission: "admin",
  input: z.strictObject({}),
  output: z.strictObject({ stopped: z.boolean() }),
});
const workspace = defineStudioWorkspace({
  id: "monitor",
  label: "Monitor",
  permission: "admin",
  data: z.strictObject({ stopped: z.boolean() }),
  actions: [action],
  view: ({ data }) => ({
    title: data.stopped ? "Stopped" : "Running",
    blocks: [],
  }),
});
const harness = createBrainTestHarness();
try {
  await harness.installPackage(
    defineInterface(
      {
        id: "web",
        config: z.strictObject({}),
        setup: () => ({ stopped: false }),
      },
      {
        studioWorkspaces: (binding) => [
          workspace.bind(binding, {
            load: ({ state }) => ({ stopped: state.stopped }),
            actions: [
              action.bind(binding, (context) => {
                const authorityShapes = (): void => {
                  // @ts-expect-error Interface workspaces retain read-only entity access.
                  void context.entities.create({});
                  // @ts-expect-error No raw entity service escapes through operator contexts.
                  void context.entityService;
                };
                void authorityShapes;
                context.state.stopped = true;
                return { stopped: true };
              }),
            ],
          }),
        ],
        health: () => ({
          record: (): { status: "healthy"; message: string } => ({
            status: "healthy",
            message: "Recording",
          }),
        }),
      },
    ),
    {},
    { name: "@fixture/interface-monitor", version: "0.0.0" },
  );
} finally {
  await harness.reset();
}
