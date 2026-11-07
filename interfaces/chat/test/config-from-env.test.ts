import { describe, expect, it } from "bun:test";
import { chatConfigFromEnv } from "../src/config-from-env";
import { chatConfigSchema } from "../src/config";

const fullEnv = {
  DISCORD_BOT_TOKEN: "discord-token",
  DISCORD_PUBLIC_KEY: "a".repeat(64),
  DISCORD_APPLICATION_ID: "discord-application-id",
};

describe("chatConfigFromEnv", () => {
  it("wires the Discord adapter when all three credentials are present", () => {
    const config = chatConfigSchema.parse(chatConfigFromEnv(fullEnv));

    expect(config.adapters.discord).toMatchObject({
      botToken: "discord-token",
      publicKey: "a".repeat(64),
      applicationId: "discord-application-id",
      captureUrls: false,
    });
  });

  it("applies brain-model defaults alongside the credentials", () => {
    const config = chatConfigSchema.parse(
      chatConfigFromEnv(fullEnv, { captureUrls: true }),
    );

    expect(config.adapters.discord?.captureUrls).toBe(true);
  });

  it.each([
    ["DISCORD_BOT_TOKEN"],
    ["DISCORD_PUBLIC_KEY"],
    ["DISCORD_APPLICATION_ID"],
  ])("leaves the adapter off when %s is missing", (missing) => {
    const env: Record<string, string | undefined> = { ...fullEnv };
    delete env[missing];

    expect(chatConfigFromEnv(env)).toEqual({});
  });

  it("leaves the adapter off for an empty environment", () => {
    expect(chatConfigFromEnv({})).toEqual({});
  });
});

describe("chatConfigFromEnv WhatsApp", () => {
  it("wires the WhatsApp adapter from the phone number, digits only", () => {
    const config = chatConfigSchema.parse(
      chatConfigFromEnv({ WHATSAPP_PHONE_NUMBER: "+31 6 0000 0001" }),
    );

    expect(config.adapters.whatsapp?.phoneNumber).toBe("31600000001");
    expect(config.adapters.discord).toBeUndefined();
  });

  it("wires WhatsApp beside Discord", () => {
    const config = chatConfigSchema.parse(
      chatConfigFromEnv({ ...fullEnv, WHATSAPP_PHONE_NUMBER: "31600000001" }),
    );

    expect(config.adapters.discord?.botToken).toBe("discord-token");
    expect(config.adapters.whatsapp?.phoneNumber).toBe("31600000001");
  });

  it("leaves WhatsApp off when the phone number is empty", () => {
    expect(chatConfigFromEnv({ WHATSAPP_PHONE_NUMBER: " " })).toEqual({});
  });
});
