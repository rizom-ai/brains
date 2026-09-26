import type { Logger } from "@brains/utils/logger";
import type { EntityConversationReader } from "../job/job-context-contract";

/** Low-level callback projections must not depend on base context namespaces. */
export function createPluginLogger(source: Logger): Logger {
  return Object.freeze({
    silly: source.silly.bind(source),
    verbose: source.verbose.bind(source),
    debug: source.debug.bind(source),
    info: source.info.bind(source),
    warn: source.warn.bind(source),
    error: source.error.bind(source),
    child: (context: string) => createPluginLogger(source.child(context)),
    setUseStderr: source.setUseStderr.bind(source),
  });
}

export function createConversationReader(
  source: EntityConversationReader,
): EntityConversationReader {
  return Object.freeze({
    get: source.get.bind(source),
    getMessages: source.getMessages.bind(source),
    getManyWithMessages: source.getManyWithMessages.bind(source),
  });
}
