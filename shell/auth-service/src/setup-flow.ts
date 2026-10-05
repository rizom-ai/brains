import { randomUUID } from "node:crypto";
import { SerialQueue } from "@brains/utils/serial-queue";
import type { PasskeyService } from "./passkey-service";
import {
  setupTokenId,
  type TargetedSetupStatePersistence,
} from "./setup-state-store";
import { absoluteUrl } from "./issuer";
import { htmlResponse } from "./http-responses";
import {
  renderInactiveSetupPage,
  renderSetupPage,
  renderSetupSessionConflictPage,
} from "./pages";

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

export interface ResolvedSetupToken {
  token: string;
  targetUserId: string | null;
  deliveryClaimId: string | null;
}

export interface SetupFlowOptions {
  setupStateStore: TargetedSetupStatePersistence;
  passkeyService: PasskeyService;
  setupTokenTtlSeconds?: number;
  resolveSessionUserId?: (request: Request) => Promise<string | undefined>;
}

/**
 * One-shot passkey setup flow: the single-use setup token lifecycle, the
 * setup page it gates, and the record of setup email deliveries.
 */
export class SetupFlow {
  private readonly setupStateStore: TargetedSetupStatePersistence;
  private readonly passkeyService: PasskeyService;
  private readonly setupTokenTtlSeconds: number;
  private readonly resolveSessionUserId:
    ((request: Request) => Promise<string | undefined>) | undefined;
  private readonly setupOperations = new SerialQueue();
  private setupToken: SetupTokenState | undefined;

  constructor(options: SetupFlowOptions) {
    this.setupStateStore = options.setupStateStore;
    this.passkeyService = options.passkeyService;
    this.setupTokenTtlSeconds =
      options.setupTokenTtlSeconds ?? DEFAULT_SETUP_TOKEN_TTL_SECONDS;
    this.resolveSessionUserId = options.resolveSessionUserId;
  }

  ensureSetupToken(): Promise<SetupTokenState | undefined> {
    return this.setupOperations.run(() => this.ensureSetupTokenInternal());
  }

  private async ensureSetupTokenInternal(): Promise<
    SetupTokenState | undefined
  > {
    const activeSetupToken = await this.getActiveSetupToken();
    if (activeSetupToken) return activeSetupToken;
    const now = Math.floor(Date.now() / 1000);
    if (await this.setupStateStore.hasActiveSetupToken(now)) {
      return (await this.setupStateStore.hasActiveSetupDelivery(now))
        ? undefined
        : this.createSetupToken();
    }

    return this.createSetupToken();
  }

  private async createSetupToken(): Promise<SetupTokenState> {
    const setupToken = {
      token: `setup_${randomUUID()}`,
      expiresAt: Math.floor(Date.now() / 1000) + this.setupTokenTtlSeconds,
    };
    await this.setupStateStore.saveSetupToken(setupToken);
    this.setupToken = setupToken;
    return setupToken;
  }

  /**
   * This process's token while the shared store still holds it active.
   * Another process may have rotated it, which leaves the cached copy dead.
   */
  private async getActiveSetupToken(): Promise<SetupTokenState | undefined> {
    this.setupToken = await this.setupStateStore.getValidSetupToken(
      Math.floor(Date.now() / 1000),
    );
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
  ): Promise<ResolvedSetupToken | undefined> {
    const url = new URL(request.url);
    const token =
      url.searchParams.get("setup_token") ?? url.searchParams.get("token");
    if (!token) return undefined;
    const target = await this.setupStateStore.getSetupTokenTarget(
      token,
      Math.floor(Date.now() / 1000),
    );
    return target ? { token, ...target } : undefined;
  }

  async hasValidSetupToken(request: Request): Promise<boolean> {
    return Boolean(await this.resolveSetupToken(request));
  }

  async hasConflictingAccountSession(
    request: Request,
    setup: ResolvedSetupToken,
  ): Promise<boolean> {
    if (!setup.targetUserId || !this.resolveSessionUserId) return false;
    const sessionUserId = await this.resolveSessionUserId(request);
    return sessionUserId !== undefined && sessionUserId !== setup.targetUserId;
  }

  /** Consume the supplied setup token once registration completes. */
  consumeSetupToken(token: string): Promise<void> {
    return this.setupOperations.run(async () => {
      if (this.setupToken?.token === token) {
        this.setupToken = undefined;
      }
      await this.setupStateStore.consumeSetupToken(token);
    });
  }

  /** Clear first-Anchor setup state after initial bootstrap completes. */
  clearSetupState(): Promise<void> {
    return this.setupOperations.run(async () => {
      this.setupToken = undefined;
      await this.setupStateStore.clearSetupState();
    });
  }

  getSetupUrl(issuer: string): string | undefined {
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return undefined;
    return absoluteUrl(
      issuer,
      `/setup?token=${encodeURIComponent(setupToken.token)}`,
    );
  }

  getPasskeySetupRequired(
    issuer: string,
    options: { rotateHidden?: boolean } = {},
  ): Promise<PasskeySetupRequired | undefined> {
    return this.setupOperations.run(async () => {
      if (await this.passkeyService.hasCredentials()) return undefined;
      let setupToken = await this.getActiveSetupToken();
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
    });
  }

  async createUserPasskeySetup(
    userId: string,
    issuer: string,
    options: { deliveryClaimId?: string } = {},
  ): Promise<PasskeySetupRequired> {
    const setupToken = {
      token: `setup_${randomUUID()}`,
      expiresAt: Math.floor(Date.now() / 1000) + this.setupTokenTtlSeconds,
    };
    await this.setupStateStore.saveTargetedSetupToken(
      setupToken,
      userId,
      options,
    );
    return {
      setupUrl: absoluteUrl(
        issuer,
        `/setup?token=${encodeURIComponent(setupToken.token)}`,
      ),
      expiresAt: setupToken.expiresAt,
      setupTokenId: setupTokenId(setupToken.token),
    };
  }

  consumeTargetedSetupTokensForUser(userId: string): Promise<number> {
    return this.setupStateStore.consumeTargetedSetupTokensForUser(userId);
  }

  async handleSetupPage(request: Request): Promise<Response> {
    const setup = await this.resolveSetupToken(request);
    if (
      (await this.passkeyService.hasCredentials()) &&
      setup?.targetUserId == null
    ) {
      return htmlResponse(renderInactiveSetupPage(), 404);
    }
    if (!setup) {
      return new Response("Not Found", { status: 404 });
    }
    if (await this.hasConflictingAccountSession(request, setup)) {
      const url = new URL(request.url);
      return htmlResponse(
        renderSetupSessionConflictPage(`${url.pathname}${url.search}`),
        409,
      );
    }

    return htmlResponse(renderSetupPage(setup.token));
  }

  async hasSetupDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    return this.setupStateStore.hasDelivery(setupTokenIdValue, recipient);
  }

  async recordSetupDelivery(
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

  async hasSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    return this.hasSetupDelivery(setupTokenIdValue, recipient);
  }

  async recordSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: { deliveryId?: string } = {},
  ): Promise<void> {
    await this.recordSetupDelivery(setupTokenIdValue, recipient, options);
  }
}
