import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "@brains/plugins";
import { InvitationChannels } from "../src/invitation-channels";

const issuer = "https://brain.test";

function channels(options: {
  providers?: Record<string, ChannelDeliveryProvider>;
  descriptors?: Record<string, ChannelDescriptor>;
  lookupProviders?: boolean;
  lookupDescriptors?: boolean;
}): InvitationChannels {
  const { providers = {}, descriptors = {} } = options;
  return new InvitationChannels({
    issuer,
    ...(options.lookupProviders === false
      ? {}
      : {
          getDeliveryProvider: (
            channelType: string,
          ): ChannelDeliveryProvider | undefined => providers[channelType],
        }),
    ...(options.lookupDescriptors === false
      ? {}
      : {
          getChannelDescriptor: (
            channelType: string,
          ): ChannelDescriptor | undefined => descriptors[channelType],
        }),
  });
}

function provider(
  overrides: Partial<ChannelDeliveryProvider> = {},
): ChannelDeliveryProvider {
  return {
    channelType: "email",
    isAvailable: (): Promise<boolean> => Promise.resolve(true),
    send: () => Promise.resolve({ status: "sent", providerDeliveryId: "d1" }),
    ...overrides,
  };
}

function descriptor(
  overrides: Partial<ChannelDescriptor> = {},
): ChannelDescriptor {
  return {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
    ...overrides,
  };
}

/** The value a call threw, or undefined where it was accepted. */
function refusalFrom(work: () => void): unknown {
  try {
    work();
    return undefined;
  } catch (cause) {
    return cause;
  }
}

async function thrownMessage(work: Promise<unknown>): Promise<string> {
  let thrown: unknown;
  try {
    await work;
  } catch (cause) {
    thrown = cause;
  }
  return caughtError(thrown).message;
}

describe("InvitationChannels", () => {
  describe("availability", () => {
    it("is unavailable when no provider is registered", async () => {
      expect(await channels({}).available("email")).toBe(false);
    });

    it("is unavailable when the provider says so", async () => {
      const subject = channels({
        providers: {
          email: provider({ isAvailable: () => Promise.resolve(false) }),
        },
      });

      expect(await subject.available("email")).toBe(false);
    });

    it("treats a provider that throws as unavailable rather than failing", async () => {
      const subject = channels({
        providers: {
          email: provider({
            isAvailable: () => Promise.reject(new Error("probe exploded")),
          }),
        },
      });

      expect(await subject.available("email")).toBe(false);
    });
  });

  describe("delivery mode", () => {
    it("refuses an automatic send with no available provider", async () => {
      const subject = channels({ descriptors: { email: descriptor() } });

      expect(
        await thrownMessage(subject.ensureModeAvailable("email", "automatic")),
      ).toBe("Invitation delivery provider is unavailable");
    });

    it("refuses a channel that is not registered at all", async () => {
      const subject = channels({ descriptors: {} });

      expect(
        await thrownMessage(subject.ensureModeAvailable("carrier", "manual")),
      ).toContain('not registered: "carrier"');
    });

    it("refuses manual delivery on a channel that does not offer it", async () => {
      const subject = channels({ descriptors: { email: descriptor() } });

      expect(
        await thrownMessage(subject.ensureModeAvailable("email", "manual")),
      ).toContain('unavailable for channel: "email"');
    });

    it("allows manual delivery where the channel offers it", async () => {
      const subject = channels({
        descriptors: { email: descriptor({ manualDelivery: true }) },
      });

      expect(
        await subject.ensureModeAvailable("email", "manual"),
      ).toBeUndefined();
    });
  });

  describe("subject validation", () => {
    it("accepts a subject the channel's pattern allows, ignoring padding", () => {
      const subject = channels({
        descriptors: { email: descriptor({ subjectPattern: /^[^@]+@[^@]+$/ }) },
      });

      expect(
        refusalFrom(() => subject.validateSubject("email", " a@b.test ")),
      ).toBeUndefined();
    });

    it("refuses a subject the channel's pattern rejects", () => {
      const subject = channels({
        descriptors: { email: descriptor({ subjectPattern: /^[^@]+@[^@]+$/ }) },
      });

      const refusal = refusalFrom(() =>
        subject.validateSubject("email", "not-an-address"),
      );

      expect(caughtError(refusal).message).toContain(
        'invalid for channel: "email"',
      );
    });

    it("accepts anything where the channel declares no pattern", () => {
      const subject = channels({ descriptors: { email: descriptor() } });

      expect(
        refusalFrom(() => subject.validateSubject("email", "any")),
      ).toBeUndefined();
    });
  });

  describe("sending", () => {
    it("fails without sending when the provider is gone", async () => {
      const result = await channels({}).send({
        providerId: "email",
        recipient: "person@example.test",
        setupToken: "setup_abc",
        expiresAtSeconds: 1_800_000_000,
        idempotencyKey: "attempt-1",
      });

      expect(result).toEqual({
        status: "failed",
        failureCode: "delivery_provider_unavailable",
      });
    });

    it("sends the setup link, the expiry and the attempt's idempotency key", async () => {
      let sent: { [key: string]: unknown } | undefined;
      const subject = channels({
        providers: {
          email: provider({
            send: (input) => {
              sent = { ...input };
              return Promise.resolve({
                status: "sent",
                providerDeliveryId: "d1",
              });
            },
          }),
        },
      });

      await subject.send({
        providerId: "email",
        recipient: "person@example.test",
        setupToken: "setup_abc",
        expiresAtSeconds: 1_800_000_000,
        idempotencyKey: "attempt-1",
      });

      expect(sent?.["recipient"]).toBe("person@example.test");
      expect(sent?.["idempotencyKey"]).toBe("attempt-1");
      expect(String(sent?.["text"])).toContain("setup_abc");
      expect(String(sent?.["text"])).toContain(
        new Date(1_800_000_000 * 1000).toISOString(),
      );
      expect(String(sent?.["subject"])).toContain("brain.test");
    });
  });
});
