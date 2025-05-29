import { App } from "@brains/app";

// Simplest possible Brain app - stdio transport with default settings
App.run({
  name: "brain-stdio",
  database: "./brain.db",
});
