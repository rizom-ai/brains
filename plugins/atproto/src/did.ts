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
  service?: DidDocumentService[];
}

export interface ConfiguredDidWebDocument {
  path: string;
  hostname: string;
  document: DidDocument;
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

export function didWebToDocumentPath(did: string): string | undefined {
  if (!isDidWeb(did)) return undefined;

  const suffix = did.slice("did:web:".length);
  if (!suffix) return undefined;

  const [, ...pathParts] = suffix.split(":");
  if (pathParts.length === 0) return "/.well-known/did.json";

  const decodedParts = pathParts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  return `/${decodedParts.join("/")}/did.json`;
}

export function normalizeServiceEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

export function didWebFromHostname(hostname: string): string {
  return `did:web:${encodeURIComponent(hostname)}`;
}

export function anchorDidWebFromHostname(hostname: string): string {
  return `${didWebFromHostname(hostname)}:anchor`;
}

function buildBaseDidWebDocument(did: string): DidDocument {
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: did,
  };
}

function buildBrainDidWebDocument(
  config: AtprotoConfig,
  did: string,
): DidDocument {
  const alsoKnownAs = config.identifier?.startsWith("did:")
    ? undefined
    : config.identifier
      ? [`at://${config.identifier}`]
      : undefined;

  return {
    ...buildBaseDidWebDocument(did),
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

export function buildDidWebDocument(config: AtprotoConfig): DidDocument | null {
  if (!isDidWeb(config.brainDid)) return null;
  return buildBrainDidWebDocument(config, config.brainDid);
}

function createConfiguredDocument(
  did: string | undefined,
  document: DidDocument | null,
): ConfiguredDidWebDocument | undefined {
  if (!did || !document) return undefined;
  const hostname = didWebToHostname(did);
  const path = didWebToDocumentPath(did);
  if (!hostname || !path) return undefined;
  return { path, hostname, document };
}

export function buildConfiguredDidWebDocuments(
  config: AtprotoConfig,
): ConfiguredDidWebDocument[] {
  const configured: ConfiguredDidWebDocument[] = [];
  const brainDocument = createConfiguredDocument(
    config.brainDid,
    buildDidWebDocument(config),
  );
  if (brainDocument) configured.push(brainDocument);

  if (isDidWeb(config.anchorDid) && config.anchorDid !== config.brainDid) {
    const anchorDocument = createConfiguredDocument(
      config.anchorDid,
      buildBaseDidWebDocument(config.anchorDid),
    );
    if (anchorDocument) configured.push(anchorDocument);
  }

  return configured;
}

export function buildConventionalDidWebDocuments(
  config: AtprotoConfig,
  hostname: string,
): ConfiguredDidWebDocument[] {
  const documents: ConfiguredDidWebDocument[] = [];
  if (!config.brainDid) {
    const brainDid = didWebFromHostname(hostname);
    documents.push({
      path: "/.well-known/did.json",
      hostname,
      document: buildBrainDidWebDocument(config, brainDid),
    });
  }
  if (!config.anchorDid) {
    const anchorDid = anchorDidWebFromHostname(hostname);
    documents.push({
      path: "/anchor/did.json",
      hostname,
      document: buildBaseDidWebDocument(anchorDid),
    });
  }
  return documents;
}
