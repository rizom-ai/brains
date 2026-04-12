export interface UserSecretNames {
  gitSyncTokenSecretName: string;
  mcpAuthTokenSecretName: string;
  discordBotTokenSecretName: string;
}

export function deriveUserSecretNames(handle: string): UserSecretNames {
  const suffix = handle.replaceAll("-", "_").toUpperCase();

  return {
    gitSyncTokenSecretName: `GIT_SYNC_TOKEN_${suffix}`,
    mcpAuthTokenSecretName: `MCP_AUTH_TOKEN_${suffix}`,
    discordBotTokenSecretName: `DISCORD_BOT_TOKEN_${suffix}`,
  };
}
