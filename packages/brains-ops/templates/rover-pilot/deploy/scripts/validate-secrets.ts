import { readFileSync } from "node:fs";
import { parseEnvSchema } from "./helpers";

const envSchemaPath = ".env.schema";
const schema = parseEnvSchema(readFileSync(envSchemaPath, "utf8"));
const requiredKeys = schema
  .filter((entry) => entry.required)
  .map((entry) => entry.key);

const missing: string[] = [];
for (const key of requiredKeys) {
  if (!process.env[key]) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing required secrets: ${missing.join(", ")}`);
}
