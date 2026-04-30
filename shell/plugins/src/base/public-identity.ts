import type {
  AnchorProfile as RuntimeAnchorProfile,
  BrainCharacter as RuntimeBrainCharacter,
} from "@brains/identity-service";
import {
  AnchorProfileSchema,
  BrainCharacterSchema,
  type AnchorProfile,
  type BrainCharacter,
} from "../contracts/identity";

export function toPublicBrainCharacter(
  character: RuntimeBrainCharacter,
): BrainCharacter {
  return BrainCharacterSchema.parse(character);
}

export function toPublicAnchorProfile(
  profile: RuntimeAnchorProfile,
): AnchorProfile {
  return AnchorProfileSchema.parse(profile);
}
