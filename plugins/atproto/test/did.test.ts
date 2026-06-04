import { describe, expect, it } from "bun:test";
import {
  buildConfiguredDidWebDocuments,
  buildDidWebDocument,
  didWebToDocumentPath,
  didWebToHostname,
  isDidWeb,
  normalizeServiceEndpoint,
} from "../src";

const baseConfig = {
  enabled: true,
  pdsEndpoint: "https://pds.example.com/",
  identifier: "brain.example.com",
  brainDid: "did:web:brain.example.com",
};

describe("did helpers", () => {
  it("identifies did:web values", () => {
    expect(isDidWeb("did:web:brain.example.com")).toBe(true);
    expect(isDidWeb("did:plc:abc123")).toBe(false);
    expect(isDidWeb(undefined)).toBe(false);
  });

  it("extracts did:web hostname", () => {
    expect(didWebToHostname("did:web:brain.example.com")).toBe(
      "brain.example.com",
    );
    expect(didWebToHostname("did:web:brain.example.com:agent")).toBe(
      "brain.example.com",
    );
    expect(didWebToHostname("did:plc:abc123")).toBeUndefined();
  });

  it("normalizes service endpoints", () => {
    expect(normalizeServiceEndpoint("https://pds.example.com///")).toBe(
      "https://pds.example.com",
    );
  });

  it("maps did:web identities to document paths", () => {
    expect(didWebToDocumentPath("did:web:brain.example.com")).toBe(
      "/.well-known/did.json",
    );
    expect(didWebToDocumentPath("did:web:brain.example.com:anchor")).toBe(
      "/anchor/did.json",
    );
    expect(didWebToDocumentPath("did:web:brain.example.com:ids:owner")).toBe(
      "/ids/owner/did.json",
    );
    expect(didWebToDocumentPath("did:plc:abc123")).toBeUndefined();
  });

  it("builds a did:web document for AT Protocol", () => {
    const doc = buildDidWebDocument(baseConfig);

    expect(doc).toEqual({
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: "did:web:brain.example.com",
      alsoKnownAs: ["at://brain.example.com"],
      service: [
        {
          id: "#atproto_pds",
          type: "AtprotoPersonalDataServer",
          serviceEndpoint: "https://pds.example.com",
        },
      ],
    });
  });

  it("does not build a did document for non did:web identities", () => {
    expect(
      buildDidWebDocument({ ...baseConfig, brainDid: "did:plc:abc123" }),
    ).toBeNull();
  });

  it("builds configured brain and anchor did:web documents", () => {
    const docs = buildConfiguredDidWebDocuments({
      ...baseConfig,
      anchorDid: "did:web:brain.example.com:anchor",
    });

    expect(docs).toEqual([
      {
        path: "/.well-known/did.json",
        hostname: "brain.example.com",
        document: expect.objectContaining({
          id: "did:web:brain.example.com",
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "https://pds.example.com",
            },
          ],
        }),
      },
      {
        path: "/anchor/did.json",
        hostname: "brain.example.com",
        document: {
          "@context": ["https://www.w3.org/ns/did/v1"],
          id: "did:web:brain.example.com:anchor",
        },
      },
    ]);
  });
});
