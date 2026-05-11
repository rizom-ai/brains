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

// Profile helpers (shared across layout packages)
export { baseProfileExtension, fetchAnchorProfile } from "./profile-helpers";

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
  type CanonicalIdentityResolution,
  type ICanonicalIdentityService,
} from "./canonical-identity-service";
export { CanonicalIdentityLinkAdapter } from "./canonical-identity-link-adapter";
export {
  CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
  canonicalIdentityActorSchema,
  canonicalIdentityLinkBodySchema,
  canonicalIdentityLinkFrontmatterSchema,
  canonicalIdentityLinkSchema,
  type CanonicalIdentityActor,
  type CanonicalIdentityLink,
  type CanonicalIdentityLinkEntity,
} from "./canonical-identity-link-schema";
