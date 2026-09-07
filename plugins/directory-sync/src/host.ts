import type {
  ServiceGitBroker,
  ServiceJobs,
  ServicePublisher,
  ServiceRole,
} from "@brains/sdk/services";
import type { EntityMirror } from "@brains/sdk/plugins";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/sdk/services";
import type { Logger } from "@brains/utils/logger";

/**
 * What directory-sync reaches of the brain it mirrors, as the declared setup
 * context hands it over.
 *
 * The records come as a mirror keeps them — every type, read and written as
 * the file says. The rest is the process: which role this is, where the git
 * broker is, where the data lives, the queue the sweeps are filed on, the
 * bus the status is asked over, and the state that survives a restart.
 */
export interface DirectorySyncHost {
  readonly mirror: EntityMirror;
  readonly jobs: ServiceJobs;
  readonly messaging: ServicePublisher;
  readonly state: <TValue>(
    options: RuntimeStateScopeOptions<TValue>,
  ) => IRuntimeStateStore<TValue>;
  readonly logger: Logger;
  readonly dataDir: string;
  readonly role: ServiceRole;
  readonly gitBroker: ServiceGitBroker;
}
