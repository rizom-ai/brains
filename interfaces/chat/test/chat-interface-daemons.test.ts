import { describe, it, expect } from "bun:test";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createPlugin,
  lastAdapter,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface gateway daemons", () => {
  const suite = setupChatInterfaceTest();

  it("runs Slack without starting the Discord gateway", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("chat");
    await registry.stopPlugin("chat");

    expect(MockChatSdk.instances[0]?.initialize).toHaveBeenCalledTimes(1);
    expect(lastAdapter.discord?.startGatewayListener).toBeUndefined();
    expect(MockChatSdk.instances[0]?.shutdown).toHaveBeenCalledTimes(1);
  });

  it("registers an abortable Discord gateway daemon", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const registry = suite.harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("chat");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await registry.stopPlugin("chat");

    expect(lastAdapter.discord?.startGatewayListener).toHaveBeenCalled();
    expect(MockChatSdk.instances[0]?.shutdown).toHaveBeenCalled();
    expect(
      lastAdapter.discord?.startGatewayListener.mock.calls[0]?.[2]?.aborted,
    ).toBe(true);
  });
});
