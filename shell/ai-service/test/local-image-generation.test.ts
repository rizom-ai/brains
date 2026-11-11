import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { generateImageResult } from "../src/image-generation";
import {
  canGenerateImages,
  createLocalRuntimeClient,
  createProviderClients,
  type ProviderClients,
} from "../src/provider-clients";

const PNG_BASE64 = "iVBORw0KGgo=";

/** A model runtime that answers every image request with one PNG. */
function runtime(): {
  clients: ProviderClients;
  requests: { url: string; body: Record<string, unknown> }[];
} {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push({
      url: String(input),
      body: z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(String(init?.body))),
    });
    return Response.json({ created: 0, data: [{ b64_json: PNG_BASE64 }] });
  };
  const fetchImpl: typeof fetch = Object.assign(respond, {
    preconnect: globalThis.fetch.preconnect,
  });
  return {
    clients: {
      ...createProviderClients({}),
      localProvider: createLocalRuntimeClient("http://models:11434", fetchImpl),
    },
    requests,
  };
}

describe("a local: image model", () => {
  it("generates on the model runtime's images API", async () => {
    const { clients, requests } = runtime();

    const result = await generateImageResult(
      "A harbor at dawn",
      "local:z-image-turbo",
      { aspectRatio: "1:1" },
      clients,
      createSilentLogger(),
    );

    expect(result.base64).toBe(PNG_BASE64);
    expect(requests).toEqual([
      {
        url: "http://models:11434/v1/images/generations",
        body: {
          model: "z-image-turbo",
          prompt: "A harbor at dawn",
          n: 1,
          size: "1024x1024",
        },
      },
    ]);
  });

  it("can generate with a model runtime and no image provider key", () => {
    const clients = createProviderClients({
      modelRuntimeUrl: "http://models:11434",
    });

    expect(canGenerateImages(clients, "local:z-image-turbo")).toBe(true);
  });

  it("cannot generate without a model runtime", () => {
    const clients = createProviderClients({ imageApiKey: "sk-img" });

    expect(canGenerateImages(clients, "local:z-image-turbo")).toBe(false);
  });

  it("leaves the default image model to the cloud providers", () => {
    const clients = createProviderClients({
      modelRuntimeUrl: "http://models:11434",
    });

    expect(canGenerateImages(clients, undefined)).toBe(false);
    expect(
      canGenerateImages(
        createProviderClients({ apiKey: "sk-test" }),
        undefined,
      ),
    ).toBe(true);
  });
});
