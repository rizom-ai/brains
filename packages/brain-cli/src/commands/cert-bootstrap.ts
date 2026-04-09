import { writeFile } from "fs/promises";
import { join } from "path";
import { z } from "@brains/utils";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  normalizePushTarget,
  resolveOpToken,
  vaultNameForInstance,
  type PushTarget,
} from "../lib/push-target";
import { runSubprocess, type RunCommand } from "../lib/run-subprocess";
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
  opToken?: string | undefined;
  pushTo?: string | undefined;
  runCommand?: RunCommand | undefined;
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
    OP_TOKEN: z.string().min(1).optional(),
    OP_SERVICE_ACCOUNT_TOKEN: z.string().min(1).optional(),
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
  const opToken = resolveOpToken(process.env, options.opToken);

  if (!cfApiToken) {
    throw new Error("Missing CF_API_TOKEN");
  }

  if (!cfZoneId) {
    throw new Error("Missing CF_ZONE_ID");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console.log;
  const runCommand = options.runCommand ?? runSubprocess;

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

  const pushTarget = normalizePushTarget(options.pushTo);
  if (pushTarget) {
    await pushCertificateArtifacts({
      cwd,
      pushTarget,
      certificatePath,
      privateKeyPath,
      certificatePem: certResult.certificatePem,
      privateKeyPem: keyPair.privateKeyPem,
      opToken,
      runCommand,
      logger,
    });
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

async function pushCertificateArtifacts(options: {
  cwd: string;
  pushTarget: PushTarget;
  certificatePath: string;
  privateKeyPath: string;
  certificatePem: string;
  privateKeyPem: string;
  opToken?: string | undefined;
  runCommand: RunCommand;
  logger: (message: string) => void;
}): Promise<void> {
  switch (options.pushTarget) {
    case "gh":
      options.logger("Pushing certificate into GitHub secrets...");
      await Promise.all([
        options.runCommand("gh", ["secret", "set", "CERTIFICATE_PEM"], {
          stdin: options.certificatePem,
        }),
        options.runCommand("gh", ["secret", "set", "PRIVATE_KEY_PEM"], {
          stdin: options.privateKeyPem,
        }),
      ]);
      return;
    case "1password": {
      const token = options.opToken;
      if (!token) {
        throw new Error(
          "Missing OP_TOKEN (or OP_SERVICE_ACCOUNT_TOKEN) for 1Password push",
        );
      }

      const vaultName = vaultNameForInstance(options.cwd);
      options.logger(
        `Pushing certificate into 1Password vault ${vaultName}...`,
      );
      const opEnv = { OP_SERVICE_ACCOUNT_TOKEN: token };
      await Promise.all([
        options.runCommand(
          "op",
          [
            "document",
            "create",
            options.certificatePath,
            "--vault",
            vaultName,
            "--title",
            "CERTIFICATE_PEM",
          ],
          { env: opEnv },
        ),
        options.runCommand(
          "op",
          [
            "document",
            "create",
            options.privateKeyPath,
            "--vault",
            vaultName,
            "--title",
            "PRIVATE_KEY_PEM",
          ],
          { env: opEnv },
        ),
      ]);
      return;
    }
  }
}
