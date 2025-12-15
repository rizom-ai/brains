import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";

export default defineConfig({
  name: "shell-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  plugins: [new SystemPlugin({})],
});
