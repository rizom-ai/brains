import { defineMessageInterface, z } from "@brains/sdk/interfaces";
import { addProcessSignalListeners } from "@brains/utils/process-signals";
import type { Instance } from "ink";
import { cliConfigSchema, type CLIConfig } from "./config";
import { renderTerminalAnswer, resolveApprovalIndexSugar } from "./render";
import type { JobProgressEvent } from "@brains/plugins";

/**
 * What the terminal UI is wired to while it runs.
 *
 * The Ink app is rendered by the listener and calls back in through
 * `processInput`; everything the app registers lands here so the daemon can
 * tear it all down together.
 */
interface TerminalState {
  app: Instance | undefined;
  removeSignalHandlers: (() => void) | undefined;
  /** Replies to what someone typed. */
  onReply: ((text: string) => void) | undefined;
  /** Job progress and completion, which the UI coalesces separately. */
  onProgress: ((text: string) => void) | undefined;
  onProgressEvents: ((events: JobProgressEvent[]) => void) | undefined;
}

/**
 * The terminal, as one declaration.
 *
 * It was a class that routed input to the agent, tracked pending approvals,
 * routed "yes" back to them and rendered the result. All of that except the
 * rendering is now the runtime's: what stays is how a terminal reads — one
 * coalesced block, approvals numbered, `yes 2` lowered back to an id.
 */
const chatReplInterface: ReturnType<typeof defineMessageInterface> =
  defineMessageInterface({
    id: "cli",
    config: cliConfigSchema,

    setup: (): TerminalState => ({
      app: undefined,
      removeSignalHandlers: undefined,
      onReply: undefined,
      onProgress: undefined,
      onProgressEvents: undefined,
    }),

    channel: {
      type: "cli",
      displayName: "CLI",
      subjectLabel: "Terminal",
      recipient: z.literal("cli"),
    },

    // One implicit channel: whoever runs the process. The terminal has no
    // second room to route between.
    listen: async ({ state, messages, signal, health }) => {
      // Dynamic, to keep React out of the module graph of anything that only
      // imports this package for its config.
      const [inkModule, reactModule, appModule] = await Promise.all([
        import("ink"),
        import("react"),
        import("./components/EnhancedApp"),
      ]);

      state.app = inkModule.render(
        reactModule.default.createElement(appModule.default, {
          interface: {
            processInput: async (text: string): Promise<void> => {
              await messages.receiveAuthenticated({
                sender: { id: "local" },
                channel: { id: "cli" },
                text,
              });
            },
          },
          registerProgressCallback: (callback): void => {
            state.onProgressEvents = callback;
          },
          unregisterProgressCallback: (): void => {
            state.onProgressEvents = undefined;
          },
          registerResponseCallback: (callback): void => {
            state.onReply = callback;
          },
          registerSystemMessageCallback: (callback): void => {
            state.onProgress = callback;
          },
          unregisterMessageCallbacks: (): void => {
            state.onReply = undefined;
            state.onProgress = undefined;
          },
        }),
      );

      // Stored so it can be removed when the daemon stops — otherwise a
      // listener leaks per start and Node warns about the max listener count.
      state.removeSignalHandlers = addProcessSignalListeners(
        ["SIGINT", "SIGTERM"],
        () => {
          state.app?.unmount();
        },
      );
      health.ready();

      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      state.removeSignalHandlers();
      state.app.unmount();
    },

    // A reply is conversation; job progress is the runtime reporting on work.
    // The UI coalesces the second and not the first, which is the whole reason
    // the runtime says which is which.
    send: ({ state, message, origin }) => {
      const deliver = origin === "progress" ? state.onProgress : state.onReply;
      deliver?.(message.text);
    },

    interpret: ({ text, approvalIds }) =>
      resolveApprovalIndexSugar(text, approvalIds),

    present: ({ directives }) => renderTerminalAnswer(directives),
  });

export default chatReplInterface;
export type { CLIConfig };
