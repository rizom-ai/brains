import type { ContentGenerationConfig } from "@brains/plugins";
import type { ShellServices } from "./initialization/shellInitializer";

export async function generateShellContent<T = unknown>(
  services: ShellServices,
  config: ContentGenerationConfig,
): Promise<T> {
  const template = services.contentService.getTemplate(config.templateName);
  if (!template) {
    throw new Error(`Template not found: ${config.templateName}`);
  }

  const grantedPermission = config.interfacePermissionGrant ?? "public";
  if (
    !services.permissionService.hasPermission(
      grantedPermission,
      template.requiredPermission,
    )
  ) {
    throw new Error(
      `Insufficient permissions: ${template.requiredPermission} required, but interface granted ${grantedPermission} for template: ${config.templateName}`,
    );
  }

  const context = {
    prompt: config.prompt,
    ...(config.conversationHistory && {
      conversationHistory: config.conversationHistory,
    }),
    ...(config.data && { data: config.data }),
  };

  return services.contentService.generateContent<T>(
    config.templateName,
    context,
  );
}
