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
  type BrainCharacter,
  type BrainCharacterEntity,
} from "./brain-character-schema";

// Anchor profile (was: profile)
export {
  AnchorProfileService,
  type IAnchorProfileService,
} from "./anchor-profile-service";
export { AnchorProfileAdapter } from "./anchor-profile-adapter";
export {
  anchorProfileSchema,
  anchorProfileBodySchema,
  anchorProfileKindSchema,
  type AnchorProfile,
  type AnchorProfileEntity,
  type AnchorProfileKind,
} from "./anchor-profile-schema";

// Canonical identity links
export {
  CanonicalIdentityService,
  type CanonicalIdentityActor,
  type CanonicalIdentityLink,
  type CanonicalIdentityResolution,
  type ICanonicalIdentityService,
} from "./canonical-identity-service";
