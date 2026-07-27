import type { ChannelDescriptor } from "@brains/plugins";
import type { AuthSetupDeliveryInput } from "./admin-contracts";
import type { AuthAuditStore } from "./audit-store";
import type { AuthIdentityRecord, AuthIdentityStore } from "./identity-store";
import { auditActor, type AuthMutationContext } from "./mutation-context";
import type {
  PasskeySetupRequired,
  ResolvedSetupToken,
  SetupFlow,
} from "./setup-flow";
import { setupTokenId } from "./setup-state-store";
import type { TargetedSetupService } from "./targeted-setup-service";
import type { AuthUserStore } from "./user-store";

export interface UserPasskeyRegistration {
  setupUrl: string;
  expiresAt: number;
  delivery: {
    type: string;
    label: string;
  };
}

export interface PasskeySetupCoordinatorOptions {
  issuer: string;
  users: AuthUserStore;
  identities: AuthIdentityStore;
  audit: AuthAuditStore;
  setupFlow: SetupFlow;
  targetedSetup: TargetedSetupService;
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
}

export class PasskeySetupCoordinator {
  private readonly issuer: string;
  private readonly users: AuthUserStore;
  private readonly identities: AuthIdentityStore;
  private readonly audit: AuthAuditStore;
  private readonly setupFlow: SetupFlow;
  private readonly targetedSetup: TargetedSetupService;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;

  constructor(options: PasskeySetupCoordinatorOptions) {
    this.issuer = options.issuer;
    this.users = options.users;
    this.identities = options.identities;
    this.audit = options.audit;
    this.setupFlow = options.setupFlow;
    this.targetedSetup = options.targetedSetup;
    this.getChannelDescriptor = options.getChannelDescriptor;
  }

  getSetupUrl(issuer: string = this.issuer): string | undefined {
    return this.setupFlow.getSetupUrl(issuer);
  }

  async startRegistration(
    userId: string,
    context: AuthMutationContext = {},
    delivery?: AuthSetupDeliveryInput,
  ): Promise<UserPasskeyRegistration> {
    const user = await this.users.getUser(userId);
    if (!user || user.status === "suspended") {
      throw new Error(`Eligible auth user not found: ${userId}`);
    }
    const deliveryIdentity = delivery
      ? await this.prepareDeliveryIdentity(userId, delivery)
      : await this.resolveStoredDeliveryIdentity(userId);
    const setup = await this.setupFlow.createUserPasskeySetup(
      userId,
      this.issuer,
      { deliveryClaimId: deliveryIdentity.id },
    );
    await this.setupFlow.recordSetupDelivery(
      setup.setupTokenId,
      deliveryIdentity.deliverySubject,
    );
    await this.audit.append({
      ...auditActor(context),
      action: "auth.passkey.registration_started",
      targetType: "user",
      targetId: userId,
      metadata: {
        expiresAt: setup.expiresAt,
        deliveryType: deliveryIdentity.type,
      },
    });
    return {
      setupUrl: setup.setupUrl,
      expiresAt: setup.expiresAt,
      delivery: {
        type: deliveryIdentity.type,
        label:
          this.getChannelDescriptor?.(deliveryIdentity.type)?.subjectLabel ??
          "Delivery channel",
      },
    };
  }

  async validateTargetedRegistration(
    setup: ResolvedSetupToken & { targetUserId: string },
  ): Promise<void> {
    await this.targetedSetup.validate({
      userId: setup.targetUserId,
      setupTokenId: setupTokenId(setup.token),
    });
  }

  async completeTargetedRegistration(
    setup: ResolvedSetupToken & { targetUserId: string },
  ): Promise<void> {
    const before = await this.users.getUser(setup.targetUserId);
    const completed = await this.targetedSetup.complete({
      userId: setup.targetUserId,
      setupTokenId: setupTokenId(setup.token),
    });
    if (before?.status === "invited" && completed.user.status === "active") {
      await this.audit.append({
        actorUserId: completed.user.id,
        action: "auth.user.status_updated",
        targetType: "user",
        targetId: completed.user.id,
        metadata: { status: "active" },
      });
    }
    if (completed.boundIdentity) {
      await this.audit.append({
        actorUserId: completed.user.id,
        action: "auth.identity.delivery_bound",
        targetType: "user",
        targetId: completed.user.id,
        metadata: { type: completed.boundIdentity.type },
      });
    }
  }

  getPasskeySetupRequired(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    return this.setupFlow.getPasskeySetupRequired(issuer, {
      rotateHidden: true,
    });
  }

  getPasskeySetupRequiredForDelivery(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    return this.setupFlow.getPasskeySetupRequired(issuer);
  }

  hasSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    return this.setupFlow.hasSetupEmailDelivery(setupTokenIdValue, recipient);
  }

  recordSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: { deliveryId?: string } = {},
  ): Promise<void> {
    return this.setupFlow.recordSetupEmailDelivery(
      setupTokenIdValue,
      recipient,
      options,
    );
  }

  private async resolveStoredDeliveryIdentity(
    userId: string,
  ): Promise<AuthIdentityRecord & { deliverySubject: string }> {
    const identities = (await this.identities.listIdentities(userId)).filter(
      (
        identity,
      ): identity is AuthIdentityRecord & { deliverySubject: string } =>
        identity.revokedAt === null &&
        Boolean(identity.deliverySubject) &&
        identity.evidence.some(
          (evidence) =>
            evidence.sourceKind === "admin" ||
            (evidence.assurance === "verified" && evidence.verifiedAt !== null),
        ),
    );
    const identity = identities.at(-1);
    if (!identity) {
      throw new Error("A confirmed delivery channel is required");
    }
    return identity;
  }

  private async prepareDeliveryIdentity(
    userId: string,
    delivery: AuthSetupDeliveryInput,
  ): Promise<AuthIdentityRecord & { deliverySubject: string }> {
    const subject = delivery.subject.trim();
    const deliveryLabel = delivery.label?.trim();
    const { identity } = await this.identities.ensureIdentity({
      userId,
      type: delivery.type,
      subject,
      deliverySubject: subject,
      label:
        deliveryLabel && deliveryLabel.length > 0 ? deliveryLabel : subject,
      source: { kind: "admin" },
    });
    if (!identity.deliverySubject) {
      throw new Error("Delivery identity subject was not persisted");
    }
    return { ...identity, deliverySubject: identity.deliverySubject };
  }
}
