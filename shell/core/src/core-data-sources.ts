import type { ShellConfig } from "./config";
import { AIContentDataSource, EntityDataSource } from "./datasources";
import type { ShellServices } from "./initialization/shellInitializer";

export function registerCoreDataSources(
  services: ShellServices,
  config: ShellConfig,
): void {
  services.dataSourceRegistry.register(
    new AIContentDataSource(
      services.aiService,
      services.entityService,
      services.templateRegistry,
      () => services.identityService.getCharacterContent(),
      () => services.profileService.getProfileContent(),
      config.siteBaseUrl,
    ),
  );

  services.dataSourceRegistry.register(
    new EntityDataSource(services.entityService),
  );

  services.logger.debug("Core DataSources registered");
}
