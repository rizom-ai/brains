import { defineSection, z } from "@rizom/site";

// Compile-only: native route-script metadata is not a stable section capability.
export const unsupported = defineSection(z.object({}), () => <section />, {
  title: "Boundary probe",
  description: "Do not promote native metadata to satisfy a packed consumer.",
  // @ts-expect-error Schema-first section metadata does not expose runtimeScripts.
  runtimeScripts: [{ src: "/scripts/native-only.js" }],
});
