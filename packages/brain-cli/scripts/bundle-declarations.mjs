import { resolve } from "node:path";
import dts from "rollup-plugin-dts";

const root = resolve(import.meta.dirname, "../../..");

const aliases = new Map([
  ["@brains/app/contracts/brain-definition", resolve(root, "shell/app/src/contracts/brain-definition.ts")],
  ["@brains/app", resolve(root, "shell/app/src/brain-definition.ts")],
  ["@brains/entity-service", resolve(root, "shell/entity-service/src/index.ts")],
  ["@brains/templates", resolve(root, "shell/templates/src/index.ts")],
  ["@brains/utils", resolve(root, "shared/utils/src/index.ts")],
  ["@brains/theme-base", resolve(root, "shared/theme-base/src/index.ts")],
  ["@brains/plugins/contracts/agent", resolve(root, "shell/plugins/src/contracts/agent.ts")],
  ["@brains/plugins/contracts/app-info", resolve(root, "shell/plugins/src/contracts/app-info.ts")],
  ["@brains/plugins/contracts/conversations", resolve(root, "shell/plugins/src/contracts/conversations.ts")],
  ["@brains/plugins/contracts/identity", resolve(root, "shell/plugins/src/contracts/identity.ts")],
  ["@brains/plugins/contracts/messaging", resolve(root, "shell/plugins/src/contracts/messaging.ts")],
  ["@brains/plugins/contracts/routes", resolve(root, "shell/plugins/src/types/routes.ts")],
  ["@brains/plugins/contracts/api-routes", resolve(root, "shell/plugins/src/types/api-routes.ts")],
  ["@brains/plugins/contracts/web-routes", resolve(root, "shell/plugins/src/types/web-routes.ts")],
  ["@brains/plugins/contracts/daemons", resolve(root, "shell/plugins/src/manager/daemon-types.ts")],
  ["@brains/plugins/services/base-entity-datasource", resolve(root, "shell/plugins/src/service/base-entity-datasource.ts")],
  ["@brains/plugins/public/plugin-api", resolve(root, "shell/plugins/src/public/plugin-api.ts")],
]);

export default {
  input: process.env.INPUT,
  output: { file: process.env.OUTPUT, format: "es" },
  plugins: [
    {
      name: "brain-dts-alias",
      resolveId(source) {
        if (source.endsWith(".css")) {
          return "\0brain-empty-css";
        }
        return aliases.get(source) ?? null;
      },
      load(id) {
        if (id === "\0brain-empty-css") {
          return "const content = ''; export default content;";
        }
        return null;
      },
    },
    dts({ respectExternal: false, compilerOptions: { stripInternal: true } }),
  ],
};
