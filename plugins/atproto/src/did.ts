import type { AtprotoConfig } from "./config";

export interface DidDocumentService {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DidDocument {
  "@context": string[];
  id: string;
  alsoKnownAs?: string[];
  service: DidDocumentService[];
}

export function isDidWeb(did: string | undefined): did is string {
  return did?.startsWith("did:web:") ?? false;
}

export function didWebToHostname(did: string): string | undefined {
  if (!isDidWeb(did)) return undefined;

  const suffix = did.slice("did:web:".length);
  if (!suffix) return undefined;

  const [host] = suffix.split(":");
  if (!host) return undefined;

  try {
    return decodeURIComponent(host);
  } catch {
    return host;
  }
}

export function normalizeServiceEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

export function buildDidWebDocument(config: AtprotoConfig): DidDocument | null {
  if (!isDidWeb(config.brainDid)) return null;

  const alsoKnownAs = config.identifier?.startsWith("did:")
    ? undefined
    : config.identifier
      ? [`at://${config.identifier}`]
      : undefined;

  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: config.brainDid,
    ...(alsoKnownAs && { alsoKnownAs }),
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: normalizeServiceEndpoint(config.pdsEndpoint),
      },
    ],
  };
}
