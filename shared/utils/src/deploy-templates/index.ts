import dockerfileTemplate from "./Dockerfile" with { type: "text" };
import kamalDeployTemplate from "./kamal-deploy.yml" with { type: "text" };

export { dockerfileTemplate, kamalDeployTemplate };

export const REQUIRED_DEPLOY_MOUNTS = [
  "/opt/brain-state:/data",
  "/opt/brain-config:/config",
  "/opt/brain-dist:/app/dist",
] as const;

export function stripDeployVolumes(content: string): string {
  return content.replace(
    /\nvolumes:\n(?: {2}- .*\n)+$/,
    "\nvolumes:\n  - __VOLUMES__\n",
  );
}

export function isStaleDeployMounts(
  current: string,
  serviceName: string,
  normalize: (content: string) => string = (content) => content,
): boolean {
  const normalizedCurrent = normalize(current);
  const normalizedTemplate = normalize(
    kamalDeployTemplate.replace("__SERVICE_NAME__", serviceName),
  );

  const hasAllRequiredMounts = REQUIRED_DEPLOY_MOUNTS.every((mount) =>
    normalizedCurrent.includes(mount),
  );

  return (
    !hasAllRequiredMounts &&
    stripDeployVolumes(normalizedCurrent) ===
      stripDeployVolumes(normalizedTemplate)
  );
}
