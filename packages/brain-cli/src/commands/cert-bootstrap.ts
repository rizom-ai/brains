import { writeFile } from "fs/promises";
import { join } from "path";
import { z } from "@brains/utils";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  createOriginCertificateRequest,
  generateOriginKeyPair,
  issueCloudflareOriginCertificate,
  setCloudflareZoneSslStrict,
  type FetchLike,
} from "../lib/origin-ca";

export interface CertBootstrapOptions {
  cfApiToken?: string;
  cfZoneId?: string;
  fetchImpl?: FetchLike;
  logger?: (message: string) => void;
}

export interface CertBootstrapResult {
  domain: string;
  certificatePath: string;
  privateKeyPath: string;
  certificatePem: string;
}

const certBootstrapEnvSchema = z
  .object({
    CF_API_TOKEN: z.string().min(1).optional(),
    CF_ZONE_ID: z.string().min(1).optional(),
  })
  .passthrough();

export async function runCertBootstrap(
  cwd: string,
  options: CertBootstrapOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    await bootstrapOriginCertificate(cwd, options);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Certificate bootstrap failed",
    };
  }
}

export async function bootstrapOriginCertificate(
  cwd: string,
  options: CertBootstrapOptions = {},
): Promise<CertBootstrapResult> {
  const config = parseBrainYaml(cwd);
  const domain = config.domain;
  if (!domain) {
    throw new Error(
      "brain cert:bootstrap requires brain.yaml to define a domain",
    );
  }

  const env = certBootstrapEnvSchema.parse(process.env);
  const cfApiToken = options.cfApiToken ?? env.CF_API_TOKEN;
  const cfZoneId = options.cfZoneId ?? env.CF_ZONE_ID;

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

  const certificatePath = join(cwd, "origin.pem");
  const privateKeyPath = join(cwd, "origin.key");

  await Promise.all([
    writeFile(certificatePath, certResult.certificatePem, "utf-8"),
    // Set mode at creation so the private key is never briefly world-readable
    // between write and chmod.
    writeFile(privateKeyPath, keyPair.privateKeyPem, {
      encoding: "utf-8",
      mode: 0o600,
    }),
  ]);

  await setCloudflareZoneSslStrict(fetchImpl, cfApiToken, cfZoneId);

  logger(`Issued Origin CA cert for ${domain}`);
  logger(`Wrote ${certificatePath}`);
  logger(`Wrote ${privateKeyPath}`);
  if (certResult.expiresOn) {
    logger(`Expires on ${certResult.expiresOn}`);
  }
  logger("Cloudflare zone SSL mode set to Full (strict)");

  return {
    domain,
    certificatePath,
    privateKeyPath,
    certificatePem: certResult.certificatePem,
  };
}
