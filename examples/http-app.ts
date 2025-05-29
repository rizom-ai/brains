import { App } from "@brains/app";

// HTTP-based Brain app with custom port
App.run({
  name: "brain-http",
  transport: {
    type: "http",
    port: 8080,
  },
  database: "./brain.db",
  logLevel: "info",
});
