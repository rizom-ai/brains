import type { EntityDisplayEntry } from "@rizom/site";

export const excluded: EntityDisplayEntry = {
  label: "Excluded",
  citable: false,
};
export const selected: EntityDisplayEntry = {
  label: "Selected",
  citable: true,
};
export const fallback: EntityDisplayEntry = { label: "Fallback" };
export const invalid: EntityDisplayEntry = {
  label: "Invalid",
  // @ts-expect-error Citation selection is a boolean, not an arbitrary policy.
  citable: "public",
};
