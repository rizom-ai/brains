import { randomUUID } from "node:crypto";
import type { PasskeyService } from "./passkey-service";
import {
  setupTokenId,
  type TargetedSetupStatePersistence,
} from "./setup-state-store";
import { absoluteUrl } from "./issuer";
import { htmlResponse } from "./http-responses";
import { renderSetupPage } from "./pages";

export const DEFAULT_SETUP_TOKEN_TTL_SECONDS: number = 24 * 60 * 60;

interface SetupTokenState {
  token: string;
  expiresAt: number;
}

export interface PasskeySetupRequired {
  setupUrl: string;
  expiresAt: number;
  setupTokenId: string;
}

export interface SetupFlowOptions {
  setupStateStore: TargetedSetupStatePersistence;
  passkeyService: PasskeyService;
  setupTokenTtlSeconds?: number;
}

/**
 * One-shot passkey setup flow: the single-use setup token lifecycle, the
 * setup page it gates, and the record of setup email deliveries.
 */
export class SetupFlow {
  private readonly setupStateStore: TargetedSetupStatePersistence;
  private readonly passkeyService: PasskeyService;
  private readonly setupTokenTtlSeconds: number;
  private setupToken: SetupTokenState | undefined;

  constructor(options: SetupFlowOptions) {
    this.setupStateStore = options.setupStateStore;
    this.passkeyService = options.passkeyService;
    this.setupTokenTtlSeconds =
      options.setupTokenTtlSeconds ?? DEFAULT_SETUP_TOKEN_TTL_SECONDS;
  }

  async ensureSetupToken(): Promise<SetupTokenState | undefined> {
    const currentSetupToken = this.getValidSetupToken();
    if (currentSetupToken) return currentSetupToken;

    const storedSetupToken = await this.setupStateStore.getValidSetupToken(
      Math.floor(Date.now() / 1000),
    );
    if (storedSetupToken) {
      this.setupToken = storedSetupToken;
      return storedSetupToken;
    }
    const now = Math.floor(Date.now() / 1000);
    if (await this.setupStateStore.hasActiveSetupToken(now)) {
      return (await this.setupStateStore.hasActiveSetupDelivery(now))
        ? undefined
        : this.createSetupToken();
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

  async resolveSetupToken(
    request: Request,
  ): Promise<{ token: string; targetUserId: string | null } | undefined> {
    const url = new URL(request.url);
    const token =
      url.searchParams.get("setup_token") ?? url.searchParams.get("token");
    if (!token) return undefined;
    const target = await this.setupStateStore.getSetupTokenTarget(
      token,
      Math.floor(Date.now() / 1000),
    );
    return target ? { token, targetUserId: target.targetUserId } : undefined;
  }

  async hasValidSetupToken(request: Request): Promise<boolean> {
    return Boolean(await this.resolveSetupToken(request));
  }

  /** Consume the supplied setup token once registration completes. */
  async consumeSetupToken(token: string): Promise<void> {
    if (this.setupToken?.token === token) {
      this.setupToken = undefined;
    }
    await this.setupStateStore.consumeSetupToken(token);
  }

  /** Clear first-anchor setup state after legacy bootstrap completes. */
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

  async getPasskeySetupRequired(
    issuer: string,
    options: { rotateHidden?: boolean } = {},
  ): Promise<PasskeySetupRequired | undefined> {
    if (await this.passkeyService.hasCredentials()) return undefined;
    let setupToken = this.getValidSetupToken();
    if (!setupToken && options.rotateHidden) {
      const now = Math.floor(Date.now() / 1000);
      if (await this.setupStateStore.hasActiveSetupDelivery(now)) {
        return undefined;
      }
      setupToken = await this.createSetupToken();
    }
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

  async createUserPasskeySetup(
    userId: string,
    issuer: string,
  ): Promise<PasskeySetupRequired> {
    const setupToken = {
      token: `setup_${randomUUID()}`,
      expiresAt: Math.floor(Date.now() / 1000) + this.setupTokenTtlSeconds,
    };
    await this.setupStateStore.saveTargetedSetupToken(setupToken, userId);
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
    const setup = await this.resolveSetupToken(request);
    if (
      (await this.passkeyService.hasCredentials()) &&
      setup?.targetUserId == null
    ) {
      return new Response("Setup already completed", { status: 404 });
    }
    if (!setup) {
      return new Response("Not Found", { status: 404 });
    }

    return htmlResponse(renderSetupPage(setup.token));
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
