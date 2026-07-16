// Brain character (was: identity)
export {
  BrainCharacterService,
  type IBrainCharacterService,
} from "./brain-character-service";
export { BrainCharacterAdapter } from "./brain-character-adapter";
export {
  brainCharacterSchema,
  brainCharacterBodySchema,
  brainCharacterFrontmatterSchema,
  communicationPreferencesSchema,
  type BrainCharacter,
  type BrainCharacterEntity,
  type CommunicationPreferences,
} from "./brain-character-schema";

// Profile helpers (shared across layout packages)
export {
  baseProfileExtension,
  professionalPositionSchema,
  professionalEducationSchema,
  professionalCertificationSchema,
  professionalProfileExtension,
  fetchAnchorProfile,
  fetchAnchorProfileData,
  type BaseProfileExtension,
  type ProfessionalPosition,
  type ProfessionalEducation,
  type ProfessionalCertification,
  type ProfessionalProfileExtension,
} from "./profile-helpers";

// Anchor profile (was: profile)
export {
  AnchorProfileService,
  type IAnchorProfileService,
} from "./anchor-profile-service";
export { AnchorProfileAdapter } from "./anchor-profile-adapter";
export {
  anchorProfileSchema,
  anchorProfileBodySchema,
  type AnchorProfile,
  type AnchorProfileEntity,
} from "./anchor-profile-schema";

// Canonical identity links
export {
  CanonicalIdentityService,
  type CanonicalIdentityActor,
  type CanonicalIdentityLink,
  type CanonicalIdentityResolution,
  type ICanonicalIdentityService,
} from "./canonical-identity-service";
