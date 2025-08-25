import { createServicePluginHarness } from "@brains/plugins";
import { SiteBuilderPlugin } from "./plugins/site-builder/src/plugin";
import { readFile } from "fs/promises";

async function debugDashboard() {
  const harness = createServicePluginHarness();
  const plugin = new SiteBuilderPlugin({
    previewOutputDir: "/tmp/test-output",
    productionOutputDir: "/tmp/test-output-production",
  });
  
  await harness.installPlugin(plugin);
  
  // Read the stored entity
  const entityPath = "apps/test-brain/brain-data/site-content-preview/dashboard:main.md";
  const entityContent = await readFile(entityPath, "utf-8");
  console.log("Stored entity content:\n", entityContent);
  
  // Parse the content using the dashboard template formatter
  const templates = harness.getTemplates();
  const dashboardTemplate = templates.get("site-builder:dashboard");
  
  if (dashboardTemplate && dashboardTemplate.formatter) {
    console.log("\nParsing content with formatter:");
    const parsed = dashboardTemplate.formatter.parse(entityContent);
    console.log("Parsed data:", JSON.stringify(parsed, null, 2));
  }
  
  harness.reset();
}

debugDashboard().catch(console.error);