import { randomUUID } from "node:crypto";
import type { PasskeyService } from "./passkey-service";
import { setupTokenId, type SetupStateStore } from "./setup-state-store";
import { absoluteUrl } from "./issuer";
import { htmlResponse } from "./http-responses";
import { renderSetupPage } from "./pages";

export const DEFAULT_SETUP_TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface SetupTokenState {
  token: string;
  expiresAt: number;
}

export interface OperatorSetupRequired {
  setupUrl: string;
  expiresAt: number;
  setupTokenId: string;
}

export interface SetupFlowOptions {
  setupStateStore: SetupStateStore;
  passkeyService: PasskeyService;
  setupTokenTtlSeconds?: number;
}

/**
 * One-shot passkey setup flow: the single-use setup token lifecycle, the
 * setup page it gates, and the record of setup email deliveries.
 */
export class SetupFlow {
  private readonly setupStateStore: SetupStateStore;
  private readonly passkeyService: PasskeyService;
  private readonly setupTokenTtlSeconds: number;
  private setupToken: SetupTokenState | undefined;

  constructor(options: SetupFlowOptions) {
    this.setupStateStore = options.setupStateStore;
    this.passkeyService = options.passkeyService;
    this.setupTokenTtlSeconds =
      options.setupTokenTtlSeconds ?? DEFAULT_SETUP_TOKEN_TTL_SECONDS;
  }

  async ensureSetupToken(): Promise<SetupTokenState> {
    const currentSetupToken = this.getValidSetupToken();
    if (currentSetupToken) return currentSetupToken;

    const storedSetupToken = await this.setupStateStore.getValidSetupToken(
      Math.floor(Date.now() / 1000),
    );
    if (storedSetupToken) {
      this.setupToken = storedSetupToken;
      return storedSetupToken;
    }

    return this.createSetupToken();
  }

  private async createSetupToken(): Promise<SetupTokenState> {
    this.setupToken = {
      token: `setup_${randomUUID()}`,
      expiresAt: Math.floor(Date.now() / 1000) + this.setupTokenTtlSeconds,
    };
    await this.setupStateStore.saveSetupToken(this.setupToken);
    return this.setupToken;
  }

  getValidSetupToken(): SetupTokenState | undefined {
    if (!this.setupToken) return undefined;
    if (this.setupToken.expiresAt <= Math.floor(Date.now() / 1000)) {
      this.setupToken = undefined;
      return undefined;
    }
    return this.setupToken;
  }

  hasValidSetupToken(request: Request): boolean {
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return false;
    const url = new URL(request.url);
    const suppliedToken =
      url.searchParams.get("setup_token") ?? url.searchParams.get("token");
    return suppliedToken === setupToken.token;
  }

  /** Consume the setup token once registration completes. */
  async clearSetupState(): Promise<void> {
    this.setupToken = undefined;
    await this.setupStateStore.clearSetupState();
  }

  getSetupUrl(issuer: string): string | undefined {
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return undefined;
    return absoluteUrl(
      issuer,
      `/setup?token=${encodeURIComponent(setupToken.token)}`,
    );
  }

  async getOperatorSetupRequired(
    issuer: string,
  ): Promise<OperatorSetupRequired | undefined> {
    if (await this.passkeyService.hasCredentials()) return undefined;
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return undefined;
    return {
      setupUrl: absoluteUrl(
        issuer,
        `/setup?token=${encodeURIComponent(setupToken.token)}`,
      ),
      expiresAt: setupToken.expiresAt,
      setupTokenId: setupTokenId(setupToken.token),
    };
  }

  async handleSetupPage(request: Request): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return new Response("Setup already completed", { status: 404 });
    }
    if (!this.hasValidSetupToken(request)) {
      return new Response("Not Found", { status: 404 });
    }

    const token = new URL(request.url).searchParams.get("token") ?? "";
    return htmlResponse(renderSetupPage(token));
  }

  async hasSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    return this.setupStateStore.hasDelivery(setupTokenIdValue, recipient);
  }

  async recordSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: { deliveryId?: string } = {},
  ): Promise<void> {
    await this.setupStateStore.recordDelivery(
      setupTokenIdValue,
      recipient,
      options,
    );
  }
}
