import { z } from "@brains/utils/zod";

const channelTypePattern = /^[a-z][a-z0-9-]*$/;

export interface ChannelSubjectPattern {
  source: string;
  flags?: string | undefined;
}

export interface ChannelDescriptor {
  type: string;
  displayName: string;
  subjectLabel: string;
  subjectPattern?: ChannelSubjectPattern | undefined;
  manualDelivery?: boolean | undefined;
}

export interface ChannelDeliveryInput {
  recipient: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export type ChannelDeliveryResult =
  | { status: "sent"; providerDeliveryId?: string | undefined }
  | { status: "failed"; failureCode: string };

export interface ChannelDeliveryProvider {
  channelType: string;
  isAvailable(): Promise<boolean>;
  send(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult>;
}

export interface IChannelRegistry {
  registerDescriptor(pluginId: string, descriptor: ChannelDescriptor): void;
  registerDeliveryProvider(
    pluginId: string,
    provider: ChannelDeliveryProvider,
  ): void;
  unregisterPlugin(pluginId: string): void;
  finalize(): void;
  listDescriptors(): ChannelDescriptor[];
  getDescriptor(channelType: string): ChannelDescriptor | undefined;
  getDeliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
  isFinalized(): boolean;
}

interface DescriptorRegistration {
  pluginId: string;
  descriptor: ChannelDescriptor;
}

interface ProviderRegistration {
  pluginId: string;
  provider: ChannelDeliveryProvider;
}

const channelSubjectPatternSchema = z.strictObject({
  source: z.string().min(1).max(500),
  flags: z
    .string()
    .regex(/^[imu]*$/)
    .optional(),
});

const channelDescriptorSchema = z.strictObject({
  type: z.string().trim().regex(channelTypePattern),
  displayName: z.string().trim().min(1).max(100),
  subjectLabel: z.string().trim().min(1).max(100),
  subjectPattern: channelSubjectPatternSchema.optional(),
  manualDelivery: z.boolean().optional(),
});

/** App-scoped channel metadata and operational delivery-provider registry. */
export class ChannelRegistry implements IChannelRegistry {
  private readonly descriptorRegistrations = new Map<
    string,
    DescriptorRegistration[]
  >();
  private readonly providerRegistrations = new Map<
    string,
    ProviderRegistration[]
  >();
  private activeDescriptors = new Map<string, ChannelDescriptor>();
  private activeProviders = new Map<string, ChannelDeliveryProvider>();
  private finalized = false;

  registerDescriptor(pluginId: string, descriptor: ChannelDescriptor): void {
    this.assertRegistrationOpen();
    const owner = normalizePluginId(pluginId);
    const parsed = channelDescriptorSchema.parse(descriptor);
    if (parsed.subjectPattern) {
      new RegExp(parsed.subjectPattern.source, parsed.subjectPattern.flags);
    }
    const normalized: ChannelDescriptor = Object.freeze({
      type: parsed.type,
      displayName: parsed.displayName,
      subjectLabel: parsed.subjectLabel,
      ...(parsed.subjectPattern
        ? {
            subjectPattern: Object.freeze({ ...parsed.subjectPattern }),
          }
        : {}),
      ...(parsed.manualDelivery !== undefined
        ? { manualDelivery: parsed.manualDelivery }
        : {}),
    });
    const registrations = this.descriptorRegistrations.get(parsed.type) ?? [];
    registrations.push({ pluginId: owner, descriptor: normalized });
    this.descriptorRegistrations.set(parsed.type, registrations);
  }

  registerDeliveryProvider(
    pluginId: string,
    provider: ChannelDeliveryProvider,
  ): void {
    this.assertRegistrationOpen();
    const owner = normalizePluginId(pluginId);
    const channelType = normalizeChannelType(provider.channelType);
    if (
      typeof provider.isAvailable !== "function" ||
      typeof provider.send !== "function"
    ) {
      throw new Error("Channel delivery provider operations are required");
    }
    const normalized: ChannelDeliveryProvider = Object.freeze({
      channelType,
      isAvailable: provider.isAvailable.bind(provider),
      send: provider.send.bind(provider),
    });
    const registrations = this.providerRegistrations.get(channelType) ?? [];
    registrations.push({ pluginId: owner, provider: normalized });
    this.providerRegistrations.set(channelType, registrations);
  }

  unregisterPlugin(pluginId: string): void {
    const owner = pluginId.trim();
    for (const [type, registrations] of this.descriptorRegistrations) {
      const remaining = registrations.filter(
        (registration) => registration.pluginId !== owner,
      );
      if (remaining.length === 0) this.descriptorRegistrations.delete(type);
      else this.descriptorRegistrations.set(type, remaining);
    }
    for (const [type, registrations] of this.providerRegistrations) {
      const remaining = registrations.filter(
        (registration) => registration.pluginId !== owner,
      );
      if (remaining.length === 0) this.providerRegistrations.delete(type);
      else this.providerRegistrations.set(type, remaining);
    }
    if (this.finalized) this.rebuildActiveState(false);
  }

  finalize(): void {
    if (this.finalized) return;
    this.rebuildActiveState(true);
    this.finalized = true;
  }

  listDescriptors(): ChannelDescriptor[] {
    this.assertFinalized();
    return [...this.activeDescriptors.values()].sort((left, right) =>
      left.type.localeCompare(right.type),
    );
  }

  getDescriptor(channelType: string): ChannelDescriptor | undefined {
    this.assertFinalized();
    return this.activeDescriptors.get(normalizeChannelType(channelType));
  }

  getDeliveryProvider(
    channelType: string,
  ): ChannelDeliveryProvider | undefined {
    this.assertFinalized();
    return this.activeProviders.get(normalizeChannelType(channelType));
  }

  isFinalized(): boolean {
    return this.finalized;
  }

  private rebuildActiveState(failOnInvalid: boolean): void {
    const descriptors = new Map<string, ChannelDescriptor>();
    const providers = new Map<string, ChannelDeliveryProvider>();

    for (const [type, registrations] of this.descriptorRegistrations) {
      if (registrations.length > 1) {
        if (!failOnInvalid) continue;
        throw duplicateRegistrationError("Channel", type, registrations);
      }
      const descriptor = registrations[0]?.descriptor;
      if (descriptor) descriptors.set(type, descriptor);
    }

    for (const [type, registrations] of this.providerRegistrations) {
      if (registrations.length > 1) {
        if (!failOnInvalid) continue;
        throw duplicateRegistrationError(
          "Delivery provider for channel",
          type,
          registrations,
        );
      }
      if (!descriptors.has(type)) {
        if (failOnInvalid) {
          throw new Error(
            `Delivery provider for channel "${type}" has no descriptor`,
          );
        }
        continue;
      }
      const descriptorOwner =
        this.descriptorRegistrations.get(type)?.[0]?.pluginId;
      const providerOwner = registrations[0]?.pluginId;
      if (descriptorOwner !== providerOwner) {
        if (failOnInvalid) {
          throw new Error(
            `Delivery provider for channel "${type}" must be registered by descriptor owner "${descriptorOwner ?? "unknown"}", not "${providerOwner ?? "unknown"}"`,
          );
        }
        continue;
      }
      const provider = registrations[0]?.provider;
      if (provider) providers.set(type, provider);
    }

    this.activeDescriptors = descriptors;
    this.activeProviders = providers;
  }

  private assertRegistrationOpen(): void {
    if (this.finalized) throw new Error("Channel registration is closed");
  }

  private assertFinalized(): void {
    if (!this.finalized) throw new Error("Channel registry is not finalized");
  }
}

function normalizePluginId(pluginId: string): string {
  const normalized = pluginId.trim();
  if (!normalized)
    throw new Error("Channel registration plugin id is required");
  return normalized;
}

function normalizeChannelType(channelType: string): string {
  const normalized = channelType.trim();
  if (!channelTypePattern.test(normalized)) {
    throw new Error(`Invalid channel type: ${channelType}`);
  }
  return normalized;
}

function duplicateRegistrationError(
  label: string,
  channelType: string,
  registrations: Array<{ pluginId: string }>,
): Error {
  const pluginIds = registrations
    .map((registration) => registration.pluginId)
    .sort()
    .join(", ");
  return new Error(
    `${label} "${channelType}" is registered by multiple plugins: ${pluginIds}`,
  );
}
