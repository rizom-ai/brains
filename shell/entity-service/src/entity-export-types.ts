export interface EntityExportIntent {
  entityType: string;
  entityId: string;
  operation: "upsert" | "delete";
  revision: string;
  markedAt: number;
}

export interface EntityExportAcknowledgement {
  entityType: string;
  entityId: string;
  revision: string;
}

export interface AcknowledgeEntityExportsRequest {
  intents: readonly EntityExportAcknowledgement[];
}
