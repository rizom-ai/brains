import definition from "@rizom/brain-definition-fixture";

if (definition.name !== "fixture-brain") {
  throw new Error("Packed declarative brain definition did not resolve");
}
if (definition.plugins[0]?.definition.family !== "entity") {
  throw new Error("Packed plugin package definition did not resolve");
}
