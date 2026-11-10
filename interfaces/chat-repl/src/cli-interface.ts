import type { PluginPackageDefinition } from "@brains/sdk";
import type { DaemonHealth } from "@brains/plugins";
import { defineInterface } from "@brains/sdk/interfaces";
import {
  interfaceRuntime,
  withDaemon,
  withMessageTransport,
  type FirstPartySlotContext,
} from "@brains/sdk/internal/interface-runtime";
import { addProcessSignalListeners } from "@brains/utils/process-signals";
import { cliConfigSchema, type CLIConfig } from "./config";
import {
  createTerminalSession,
  createTerminalState,
  type TerminalState,
} from "./terminal-session";

type CliSlotContext = FirstPartySlotContext<CLIConfig, TerminalState>;

/**
 * The CLI, as one declaration. Every message goes to the agent, in the one
 * conversation the local administrator has; local UI commands (/exit,
 * /clear, /progress) stay in the terminal UI.
 */
const cli = defineInterface({
  id: "cli",
  config: cliConfigSchema,
  setup: (context): TerminalState => {
    interfaceRuntime(context).logger.debug(
      "CLI interface registered with AgentService",
    );
    return createTerminalState();
  },
});

/**
 * The terminal UI, run as the class's daemon `cli:cli`: started, it renders
 * the Ink app with the session and the callbacks it registers; stopped, it
 * removes the signal handlers and unmounts the app.
 */
const withTerminal = withDaemon(cli, (context: CliSlotContext) => {
  const { state } = context;
  const runtime = interfaceRuntime(context);
  const { logger, messages } = runtime;
  const session = createTerminalSession(runtime, state);

  const unregisterMessageCallbacks = (): void => {
    state.responseCallback = undefined;
    state.systemMessageCallback = undefined;
  };

  const cleanup = (): void => {
    messages.unregisterProgressCallback();
    unregisterMessageCallbacks();
    state.removeSignalHandlers?.();
    state.removeSignalHandlers = undefined;
    if (state.inkApp) {
      state.inkApp.unmount();
      state.inkApp = null;
    }
  };

  return {
    id: "cli",
    start: async (): Promise<void> => {
      logger.debug("Starting CLI interface");
      try {
        // Dynamic imports keep React out of anything that only reads the
        // package for its config.
        const [inkModule, reactModule, appModule] = await Promise.all([
          import("ink"),
          import("react"),
          import("./components/EnhancedApp"),
        ]);
        const React = reactModule.default;
        const element = React.createElement(appModule.default, {
          interface: session,
          registerProgressCallback: (callback) => {
            messages.registerProgressCallback(callback);
          },
          unregisterProgressCallback: () => {
            messages.unregisterProgressCallback();
          },
          registerResponseCallback: (callback) => {
            state.responseCallback = callback;
          },
          registerSystemMessageCallback: (callback) => {
            state.systemMessageCallback = callback;
          },
          unregisterMessageCallbacks,
        });
        state.inkApp = inkModule.render(element);

        // Stored so they can be removed on stop: otherwise a listener leaks
        // per start and Node warns about the max listener count.
        state.removeSignalHandlers = addProcessSignalListeners(
          ["SIGINT", "SIGTERM"],
          () => {
            logger.debug("Received termination signal, stopping CLI");
            cleanup();
          },
        );
      } catch (error) {
        logger.error("Failed to start CLI interface", { error });
        throw error;
      }
    },
    stop: async (): Promise<void> => {
      logger.debug("Stopping CLI interface");
      cleanup();
    },
    healthCheck: async (): Promise<DaemonHealth> => {
      const isRunning = state.inkApp !== null;
      return {
        status: isRunning ? "healthy" : "error",
        message: isRunning
          ? "CLI interface is running"
          : "CLI interface not running",
        lastCheck: new Date(),
        details: {
          hasInkApp: state.inkApp !== null,
          hasCallbacks: messages.hasProgressCallback(),
        },
      };
    },
  };
});

/**
 * Job progress and completion messages: the UI coalesces them apart from
 * replies, so they go to the system-message callback, or to the reply
 * callback when the UI registered none. The CLI has one implicit channel.
 */
const cliInterface: PluginPackageDefinition<
  typeof cliConfigSchema,
  "interface"
> = withMessageTransport(withTerminal, ({ state }: CliSlotContext) => ({
  send: ({ message }): void => {
    const text =
      typeof message === "string" ? message : (message.fallbackText ?? "");
    if (!text) return;
    const deliver = state.systemMessageCallback ?? state.responseCallback;
    deliver?.(text);
  },
}));

export default cliInterface;
