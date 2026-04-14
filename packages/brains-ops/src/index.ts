export { initPilotRepo } from "./init";
export {
  loadPilotRegistry,
  type LoadPilotRegistryOptions,
} from "./load-registry";
export { writeUsersTable } from "./render-users-table";
export { onboardUser } from "./onboard-user";
export { reconcileCohort } from "./reconcile-cohort";
export { reconcileAll } from "./reconcile-all";
export { parseArgs, type ParsedArgs } from "./parse-args";
export {
  bootstrapPilotAgeKey,
  extractAgeIdentity,
  runPilotAgeKeyBootstrap,
} from "./age-key-bootstrap";
export {
  bootstrapPilotSshKey,
  runPilotSshKeyBootstrap,
} from "./ssh-key-bootstrap";
export {
  bootstrapPilotOriginCertificate,
  runPilotCertBootstrap,
} from "./cert-bootstrap";
export { encryptPilotSecrets } from "./secrets-encrypt";
export { pushPilotSecrets } from "./secrets-push";
export { runCommand, type CommandResult } from "./run-command";
