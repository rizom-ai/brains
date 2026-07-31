/**
 * Shared database configuration — used by all services (entity, embedding,
 * job queue, conversation), each of which re-exports it under its own alias.
 * The parser lives with its single consumer in shell/core's config.
 */
export interface DbConfig {
  url: string;
  authToken?: string | undefined;
}
