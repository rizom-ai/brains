export interface EntityMutationAdmissionTarget {
  operation: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
}

export interface EntityMutationAdmission {
  assertMutationAdmission(target: EntityMutationAdmissionTarget): Promise<void>;
}
