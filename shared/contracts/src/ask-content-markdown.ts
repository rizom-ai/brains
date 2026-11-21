import {
  askContentFrontmatterSchema,
  askContentSchema,
  type AskContent,
} from "./ask-content";
import { recordFields, type FrontmatterRecord } from "./style-guide";

function askContent(fields: unknown, body: string): AskContent {
  return askContentSchema.parse({
    ...askContentFrontmatterSchema.parse(fields),
    ...(body.trim() ? { introduction: body.trim() } : {}),
  });
}

/** The Ask presentation a stored ask-content record holds, however it was read. */
export function askContentFromRecord(record: FrontmatterRecord): AskContent {
  const { fields, body } = recordFields(record);
  return askContent(fields, body);
}
