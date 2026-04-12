import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnvSchema } from "./helpers";

const envSchemaPath = ".env.schema";
const schema = parseEnvSchema(readFileSync(envSchemaPath, "utf8"));
const sensitiveKeys = schema
  .filter((entry) => entry.sensitive)
  .map((entry) => entry.key);

const lines: string[] = [];
for (const name of sensitiveKeys) {
  const value = process.env[name] ?? "";
  const escaped = String(value).replace(/'/g, "'\\''");
  lines.push(`${name}='${escaped}'`);
}

mkdirSync(".kamal", { recursive: true });
writeFileSync(".kamal/secrets", lines.join("\n") + "\n");
