import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createOriginCertificateRequest,
  generateOriginKeyPair,
  issueCloudflareOriginCertificate,
  readLocalEnvValues,
  resolveLocalEnvValue,
  setCloudflareZoneSslStrict,
  type FetchLike,
} from "@brains/utils";
import { findUser } from "./reconcile-lib";
import { pushSecretsToBackend, normalizePushTarget } from "./push-secrets";
import { runSubprocess, type RunCommand } from "./run-subprocess";

export interface CertBootstrapOptions {
  env?: NodeJS.ProcessEnv | undefined;
  cfApiToken?: string | undefined;
  cfZoneId?: string | undefined;
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

export async function runPilotCertBootstrap(
  rootDir: string,
  handle: string,
  options: CertBootstrapOptions = {},
): Promise<{ success: boolean; message?: string }> {
  try {
    await bootstrapPilotOriginCertificate(rootDir, handle, options);
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
  handle: string,
  options: CertBootstrapOptions = {},
): Promise<CertBootstrapResult> {
  const { user } = await findUser(rootDir, handle);
  const domain = user.domain;
  const env = options.env ?? process.env;
  const localEnvValues = readLocalEnvValues(rootDir);
  const cfApiToken =
    options.cfApiToken ??
    resolveLocalEnvValue("CF_API_TOKEN", env, localEnvValues);
  const cfZoneId =
    options.cfZoneId ?? resolveLocalEnvValue("CF_ZONE_ID", env, localEnvValues);

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
    handle,
    "origin.pem",
  );
  const privateKeyPath = join(
    rootDir,
    ".brains-ops",
    "certs",
    handle,
    "origin.key",
  );

  await mkdir(dirname(certificatePath), { recursive: true });
  await Promise.all([
    writeFile(certificatePath, certResult.certificatePem, "utf-8"),
    writeFile(privateKeyPath, keyPair.privateKeyPem, {
      encoding: "utf-8",
      mode: 0o600,
    }),
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
