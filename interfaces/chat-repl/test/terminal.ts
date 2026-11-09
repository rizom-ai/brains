import { mock } from "bun:test";
import * as ink from "ink";
import type { ReactElement } from "react";
import type { PluginTestHarness } from "@brains/plugins/test";
import type { EnhancedAppProps } from "../src/types/app-props";
import type { CLIConfigInput } from "../src/config";
import { createCliPlugin } from "./cli-plugin";

/**
 * What the terminal UI is mounted with: the input it sends and the
 * callbacks it registers. A test drives the CLI through these, as a person
 * typing into the terminal does.
 */
export type Terminal = Pick<
  EnhancedAppProps,
  | "registerProgressCallback"
  | "unregisterProgressCallback"
  | "registerResponseCallback"
  | "registerSystemMessageCallback"
  | "unregisterMessageCallbacks"
> & {
  processInput(input: string): Promise<void>;
  /** Stop the terminal daemon, as the app does at shutdown. */
  stop(): Promise<void>;
};

function isTerminalApp(
  element: ReactElement,
): element is ReactElement<EnhancedAppProps> {
  const props: unknown = element.props;
  return (
    typeof props === "object" &&
    props !== null &&
    "registerResponseCallback" in props &&
    "interface" in props
  );
}

const realRender = ink.render;
let mounted: EnhancedAppProps | undefined;

/**
 * Ink renders the terminal UI to stdout. Here it records what the CLI
 * mounted instead; anything else, such as a component test's frame, renders
 * as Ink renders it.
 */
void mock.module("ink", () => ({
  ...ink,
  render: (
    element: ReactElement,
    options?: Parameters<typeof realRender>[1],
  ): ReturnType<typeof realRender> => {
    if (!isTerminalApp(element)) return realRender(element, options);
    mounted = element.props;
    // Recorded, not drawn: the test registers the callbacks the UI would.
    return {
      rerender: (): void => {},
      unmount: (): void => {},
      waitUntilExit: async (): Promise<unknown> => undefined,
      waitUntilRenderFlush: async (): Promise<void> => {},
      cleanup: (): void => {},
      clear: (): void => {},
    };
  },
}));

/** What the CLI last mounted; read through a call so it is not narrowed. */
function lastMounted(): EnhancedAppProps | undefined {
  return mounted;
}

/** Install the CLI and start its terminal daemon, as the app does. */
export async function startTerminal(
  harness: PluginTestHarness,
  config: CLIConfigInput = {},
): Promise<Terminal> {
  mounted = undefined;
  await harness.installPlugin(createCliPlugin(config));
  const registry = harness.getMockShell().getDaemonRegistry();
  await registry.start("cli:cli");
  const props = lastMounted();
  if (!props) throw new Error("The CLI daemon mounted no terminal UI");
  return {
    processInput: (input) => props.interface.processInput(input),
    registerProgressCallback: props.registerProgressCallback,
    unregisterProgressCallback: props.unregisterProgressCallback,
    registerResponseCallback: props.registerResponseCallback,
    registerSystemMessageCallback: props.registerSystemMessageCallback,
    unregisterMessageCallbacks: props.unregisterMessageCallbacks,
    stop: () => registry.stop("cli:cli"),
  };
}
