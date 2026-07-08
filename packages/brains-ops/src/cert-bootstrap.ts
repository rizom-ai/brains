import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  readLocalEnvValues,
  resolveLocalEnvValue,
} from "@brains/deploy-support";
import {
  createOriginCertificateRequest,
  generateOriginKeyPair,
  issueCloudflareOriginCertificate,
  setCloudflareZoneSslStrict,
  type FetchLike,
} from "@brains/deploy-support/origin-ca";
import { loadPilotRegistry, type PilotRegistry } from "./load-registry";
import { pushSecretsToBackend, normalizePushTarget } from "./push-secrets";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export interface CertBootstrapOptions {
  env?: NodeJS.ProcessEnv | undefined;
  cfApiToken?: string | undefined;
  cfZoneId?: string | undefined;
  handle?: string | undefined;
  fetchImpl?: FetchLike;
  logger?: (message: string) => void;
  pushTo?: string | undefined;
  runCommand?: RunCommand | undefined;
}

export interface CertBootstrapResult {
  domain: string;
  certificatePath: string;
  privateKeyPath: string;
  certificatePem: string;
  secretsSnippetPath: string;
}

export async function runPilotCertBootstrap(
  rootDir: string,
  options: CertBootstrapOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    await bootstrapPilotOriginCertificate(rootDir, options);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Certificate bootstrap failed",
    };
  }
}

export async function bootstrapPilotOriginCertificate(
  rootDir: string,
  options: CertBootstrapOptions = {},
): Promise<CertBootstrapResult> {
  const registry = await loadPilotRegistry(rootDir);
  const target = resolveCertificateTarget(registry, options.handle);
  const domain = target.domain;
  const env = options.env ?? process.env;
  const localEnvValues = readLocalEnvValues(rootDir);
  const cfApiToken =
    options.cfApiToken ??
    resolveLocalEnvValue("CF_API_TOKEN", env, localEnvValues);
  const cfZoneId =
    options.cfZoneId ??
    target.cloudflareZoneId ??
    resolveLocalEnvValue("CF_ZONE_ID", env, localEnvValues);

  if (!cfApiToken) {
    throw new Error("Missing CF_API_TOKEN");
  }

  if (!cfZoneId) {
    throw new Error("Missing CF_ZONE_ID");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console.log;

  const keyPair = generateOriginKeyPair();
  const { csrPem } = createOriginCertificateRequest(domain, keyPair);

  const certResult = await issueCloudflareOriginCertificate(
    fetchImpl,
    cfApiToken,
    csrPem,
    domain,
  );

  const certificatePath = join(
    rootDir,
    ".brains-ops",
    "certs",
    target.id,
    "origin.pem",
  );
  const privateKeyPath = join(
    rootDir,
    ".brains-ops",
    "certs",
    target.id,
    "origin.key",
  );

  const secretsSnippetPath = join(dirname(certificatePath), "secrets.yaml");

  await mkdir(dirname(certificatePath), { recursive: true });
  await Promise.all([
    writeFile(certificatePath, certResult.certificatePem, "utf-8"),
    writeFile(privateKeyPath, keyPair.privateKeyPem, {
      encoding: "utf-8",
      mode: 0o600,
    }),
    writeFile(
      secretsSnippetPath,
      formatSecretsSnippet(certResult.certificatePem, keyPair.privateKeyPem),
      "utf-8",
    ),
  ]);

  await setCloudflareZoneSslStrict(fetchImpl, cfApiToken, cfZoneId);

  const pushTarget = normalizePushTarget(options.pushTo);
  if (pushTarget) {
    await pushSecretsToBackend(
      pushTarget,
      [
        ["CERTIFICATE_PEM", certResult.certificatePem],
        ["PRIVATE_KEY_PEM", keyPair.privateKeyPem],
      ],
      {
        logger,
        runCommand: options.runCommand ?? runSubprocess,
      },
    );
  }

  logger(`Issued ${target.id} Origin CA cert for ${domain} and *.${domain}`);
  logger(`Wrote ${certificatePath}`);
  logger(`Wrote ${privateKeyPath}`);
  logger(`Wrote ${secretsSnippetPath}`);
  if (certResult.expiresOn) {
    logger(`Expires on ${certResult.expiresOn}`);
  }
  logger("Cloudflare zone SSL mode set to Full (strict)");
  if (pushTarget) {
    logger(`Pushed CERTIFICATE_PEM and PRIVATE_KEY_PEM to ${pushTarget}`);
  }

  return {
    domain,
    certificatePath,
    privateKeyPath,
    certificatePem: certResult.certificatePem,
    secretsSnippetPath,
  };
}

function formatSecretsSnippet(
  certificatePem: string,
  privateKeyPem: string,
): string {
  return [
    `certificatePem: ${formatEscapedSecret(certificatePem)}`,
    `privateKeyPem: ${formatEscapedSecret(privateKeyPem)}`,
    "",
  ].join("\n");
}

function formatEscapedSecret(value: string): string {
  const escaped = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

function resolveCertificateTarget(
  registry: PilotRegistry,
  handle: string | undefined,
): { id: string; domain: string; cloudflareZoneId?: string | undefined } {
  if (!handle) {
    return {
      id: "shared",
      domain: resolvePilotZone(registry.pilot.domainSuffix),
    };
  }

  const user = registry.users.find((candidate) => candidate.handle === handle);
  if (!user) {
    throw new Error(`Unknown user handle: ${handle}`);
  }

  return {
    id: handle,
    domain: user.domain,
    ...(user.cloudflareZoneId
      ? { cloudflareZoneId: user.cloudflareZoneId }
      : {}),
  };
}

function resolvePilotZone(domainSuffix: string): string {
  const zone = domainSuffix.trim().replace(/^\./, "").replace(/\.$/, "");

  if (!zone || zone.includes("*")) {
    throw new Error(`Invalid pilot domainSuffix: ${domainSuffix}`);
  }

  return zone;
}
