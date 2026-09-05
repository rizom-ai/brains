import { describe, it, expect } from "bun:test";
import {
  DISCORD_PLUGIN_ID,
  MockChatSdk,
  SLACK_PLUGIN_ID,
  createPlugin,
  createSlackPlugin,
  lastAdapter,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("chat listeners", () => {
  const suite = setupChatInterfaceTest();

  it("runs Slack without starting the Discord gateway", async () => {
    await suite.harness.installPlugin(createSlackPlugin());
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(SLACK_PLUGIN_ID);
    await registry.stopPlugin(SLACK_PLUGIN_ID);

    expect(MockChatSdk.instances[0]?.initialize).toHaveBeenCalledTimes(1);
    expect(lastAdapter.discord?.startGatewayListener).toBeUndefined();
    expect(MockChatSdk.instances[0]?.shutdown).toHaveBeenCalledTimes(1);
  });

  it("registers an abortable Discord gateway listener", async () => {
    await suite.harness.installPlugin(createPlugin());
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin(DISCORD_PLUGIN_ID);
    await Bun.sleep(0);
    await registry.stopPlugin(DISCORD_PLUGIN_ID);

    expect(lastAdapter.discord?.startGatewayListener).toHaveBeenCalled();
    expect(MockChatSdk.instances[0]?.shutdown).toHaveBeenCalled();
    expect(
      lastAdapter.discord?.startGatewayListener.mock.calls[0]?.[2]?.aborted,
    ).toBe(true);
  });
});
