export { initPilotRepo } from "./init";
export {
  loadPilotRegistry,
  type LoadPilotRegistryOptions,
} from "./load-registry";
export {
  siteImageTag,
  sitePackagesFor,
  requiredImages,
  resolveImageBuilds,
  runResolveMissingImages,
  type ImageRequirementSource,
  type RequiredImage,
  type ResolveImageBuildsOptions,
  type RunResolveMissingImagesOptions,
} from "./images";
export {
  derivePreviewDomain,
  type PreviewDomainOptions,
} from "./preview-domain";
export { writeUsersTable } from "./render-users-table";
export { onboardUser } from "./onboard-user";
export { addPilotUser } from "./user-add";
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
export { verifyPilotUser } from "./verify-user";
export {
  assertDirectorySyncStressTarget,
  directorySyncStressPlanSchema,
  directorySyncStressProfileSchema,
  directorySyncStressReportSchema,
  resolveDirectorySyncStressPlan,
  runDirectorySyncStressPlan,
  sampleStressHealth,
  stressMetricsFailure,
  type DirectorySyncStressDriver,
  type DirectorySyncStressPhase,
  type DirectorySyncStressPlan,
  type DirectorySyncStressProfile,
  type DirectorySyncStressReport,
} from "./directory-sync-stress";
export {
  cleanupDirectorySyncStress,
  runDeployedDirectorySyncStress,
  verifyDirectorySyncStressAccess,
  type CleanupDirectorySyncStressOptions,
  type CleanupDirectorySyncStressResult,
  type DeployedDirectorySyncStressOptions,
  type DeployedDirectorySyncStressResult,
  type VerifyDirectorySyncStressAccessOptions,
  type VerifyDirectorySyncStressAccessResult,
} from "./directory-sync-stress-system";
export { runCommand, type CommandResult } from "./run-command";
export {
  pilotSchema,
  cohortSchema,
  canonicalBundleIdSchema,
  type PilotConfig,
  type CohortConfig,
} from "./schema";
