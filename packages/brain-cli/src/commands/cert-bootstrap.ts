import { z } from "@brains/utils/zod";
import { parseBrainYaml } from "../lib/brain-yaml";
import { normalizePushTarget } from "@brains/deploy-support/push-target";
import { pushSecretsToGitHub } from "@brains/deploy-support/push-secrets";
import type { RunCommand } from "@brains/deploy-support/run-subprocess";
import {
  issueOriginCertificate,
  setCloudflareZoneSslStrict,
  writeOriginCertificateFiles,
} from "@brains/deploy-support/origin-ca";
import type { FetchLike } from "@brains/utils/fetch-like";
import { getErrorMessage } from "@brains/utils/error";

export interface CertBootstrapOptions {
  cfApiToken?: string;
  cfZoneId?: string;
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
}

const certBootstrapEnvSchema = z.looseObject({
  CF_API_TOKEN: z.string().min(1).optional(),
  CF_ZONE_ID: z.string().min(1).optional(),
});

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
      message: getErrorMessage(error, "Certificate bootstrap failed"),
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

  const certResult = await issueOriginCertificate(
    fetchImpl,
    cfApiToken,
    domain,
  );
  const { certificatePath, privateKeyPath } = await writeOriginCertificateFiles(
    cwd,
    certResult,
  );

  await setCloudflareZoneSslStrict(fetchImpl, cfApiToken, cfZoneId);

  const pushTarget = normalizePushTarget(options.pushTo);
  if (pushTarget) {
    await pushSecretsToGitHub(
      [
        ["CERTIFICATE_PEM", certResult.certificatePem],
        ["PRIVATE_KEY_PEM", certResult.privateKeyPem],
      ],
      { runCommand: options.runCommand, logger },
    );
  }

  logger(`Issued Origin CA cert for ${domain}`);
  logger(`Wrote ${certificatePath}`);
  logger(`Wrote ${privateKeyPath}`);
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
  };
}
