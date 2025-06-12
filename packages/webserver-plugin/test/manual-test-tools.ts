import { webserverPlugin } from "../src/index";
import { PluginTestHarness, type TestEntity } from "@brains/utils";

async function testWebserverPlugin(): Promise<void> {
  console.log("Testing webserver plugin with test harness...");

  // Create test harness
  const harness = new PluginTestHarness();

  // Create some test entities
  await harness.createTestEntity<TestEntity>("base", {
    title: "First Note",
    content: "This is my first note",
    tags: ["test", "demo"],
  });

  await harness.createTestEntity<TestEntity>("base", {
    title: "Second Note",
    content: "Another test note",
    tags: ["test"],
  });

  await harness.createTestEntity<TestEntity>("base", {
    title: "Third Note",
    content: "Yet another note",
    tags: ["demo", "example"],
  });

  // Install the plugin
  const plugin = webserverPlugin({
    siteTitle: "Test Brain",
    siteDescription: "Testing the webserver plugin",
    outputDir: "./test-output",
  });

  await harness.installPlugin(plugin);
  console.log("Plugin installed");

  // Get the plugin context to access tools
  const context = harness.getPluginContext();
  const capabilities = await plugin.register(context);

  // Find the tools
  const buildTool = capabilities.tools.find((t) => t.name === "build_site");
  const previewTool = capabilities.tools.find((t) => t.name === "preview_site");
  const statusTool = capabilities.tools.find(
    (t) => t.name === "get_site_status",
  );

  if (!buildTool || !previewTool || !statusTool) {
    throw new Error("Required tools not found");
  }

  console.log("\nBuilding site...");
  const buildResult = await buildTool.handler({ clean: true });
  console.log("Build result:", buildResult);

  console.log("\nGetting status...");
  const status = await statusTool.handler({});
  console.log("Status:", status);

  console.log("\nStarting preview...");
  const previewResult = await previewTool.handler({});
  console.log("Preview result:", previewResult);

  if (
    typeof previewResult === "object" &&
    previewResult !== null &&
    "success" in previewResult &&
    "url" in previewResult &&
    (previewResult as { success: boolean }).success &&
    (previewResult as { url: string }).url
  ) {
    console.log(
      `\nSite is running at: ${(previewResult as { url: string }).url}`,
    );
    console.log("Press Ctrl+C to stop\n");

    // Keep the process running
    await new Promise(() => {});
  }
}

// Run the test
testWebserverPlugin().catch(console.error);
