import type {
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDescriptor,
} from "@brains/plugins";
import { absoluteUrl } from "./issuer";

export interface InvitationChannelsOptions {
  issuer: string;
  getDeliveryProvider?: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
}

export interface InvitationSend {
  providerId: string;
  recipient: string;
  setupToken: string;
  /** Unix seconds, as stored on the setup token. */
  expiresAtSeconds: number;
  /** The delivery attempt's id, so a provider can deduplicate a resend. */
  idempotencyKey: string;
}

/**
 * What the registered channels can do, and how an invitation reaches one.
 *
 * This is the half of invitation delivery that never touches the database:
 * whether a channel exists, whether it can send automatically or be confirmed
 * by hand, whether a subject looks like one of its addresses, and the message
 * itself. The service keeps the transaction and the audit trail around it.
 */
export class InvitationChannels {
  private readonly issuer: string;
  private readonly getDeliveryProvider:
    ((channelType: string) => ChannelDeliveryProvider | undefined) | undefined;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;

  constructor(options: InvitationChannelsOptions) {
    this.issuer = options.issuer;
    this.getDeliveryProvider = options.getDeliveryProvider;
    this.getChannelDescriptor = options.getChannelDescriptor;
  }

  /**
   * Whether a channel can send right now.
   *
   * A provider that throws while being probed is treated as unavailable: an
   * availability check failing is not a reason to fail the invitation, and it
   * is certainly not evidence the channel works.
   */
  public async available(providerId: string): Promise<boolean> {
    try {
      const provider = this.getDeliveryProvider?.(providerId);
      return provider ? await provider.isAvailable() : false;
    } catch {
      return false;
    }
  }

  /** Throws with an operator-readable reason when the mode cannot be used. */
  public async ensureModeAvailable(
    channelType: string,
    deliveryMode: "automatic" | "manual",
  ): Promise<void> {
    const descriptor = this.getChannelDescriptor?.(channelType);
    if (this.getChannelDescriptor && !descriptor) {
      throw new Error(`Invitation channel is not registered: "${channelType}"`);
    }
    if (deliveryMode === "manual") {
      if (descriptor?.manualDelivery === true) return;
      throw new Error(
        `Manual invitation delivery is unavailable for channel: "${channelType}"`,
      );
    }
    if (await this.available(channelType)) return;
    throw new Error("Invitation delivery provider is unavailable");
  }

  /** Throws when the subject is not shaped like one of the channel's addresses. */
  public validateSubject(channelType: string, subject: string): void {
    const pattern = this.getChannelDescriptor?.(channelType)?.subjectPattern;
    if (
      pattern &&
      !new RegExp(pattern.source, pattern.flags).test(subject.trim())
    ) {
      throw new Error(
        `Invitation delivery subject is invalid for channel: "${channelType}"`,
      );
    }
  }

  /**
   * Send the invitation. A missing provider is reported as a failed delivery
   * rather than thrown, so the caller records the attempt either way.
   */
  public send(input: InvitationSend): Promise<ChannelDeliveryResult> {
    const provider = this.getDeliveryProvider?.(input.providerId);
    if (!provider) {
      return Promise.resolve({
        status: "failed",
        failureCode: "delivery_provider_unavailable",
      });
    }
    const setupUrl = absoluteUrl(
      this.issuer,
      `/setup?token=${encodeURIComponent(input.setupToken)}`,
    );
    return provider.send({
      recipient: input.recipient,
      subject: `Join ${new URL(this.issuer).hostname}`,
      text: [
        "You have been invited to access this brain.",
        "",
        `Set up your passkey: ${setupUrl}`,
        "",
        `This single-use link expires at ${new Date(input.expiresAtSeconds * 1000).toISOString()}.`,
      ].join("\n"),
      idempotencyKey: input.idempotencyKey,
    });
  }
}
