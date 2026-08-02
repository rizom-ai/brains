import { analyticsEnvSchema } from "@brains/analytics/env-schema";
import { atprotoEnvSchema } from "@brains/atproto/env-schema";
import { shellEnvVars } from "@brains/core/env-schema";
import { directorySyncEnvSchema } from "@brains/directory-sync/env-schema";
import { chatEnvSchema } from "@brains/chat/env-schema";
import { emailEnvSchema } from "@brains/email/env-schema";
import { newsletterEnvSchema } from "@brains/newsletter/env-schema";
import { socialMediaEnvSchema } from "@brains/social-media/env-schema";
import { stockPhotoEnvSchema } from "@brains/stock-photo/env-schema";
import type { EnvVarDecl } from "@brains/utils/env-schema";

/** Environment declarations for the canonical catalog and its fixed bundles. */
export const canonicalEnvSchema: EnvVarDecl[] = [
  ...shellEnvVars(),
  ...directorySyncEnvSchema,
  ...chatEnvSchema,
  ...atprotoEnvSchema,
  ...socialMediaEnvSchema,
  ...newsletterEnvSchema,
  ...emailEnvSchema,
  ...analyticsEnvSchema,
  ...stockPhotoEnvSchema,
];
