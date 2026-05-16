import type { EntityTypeConfig, Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import {
  documentAdapter,
  documentSchema,
  type DocumentEntity,
} from "@brains/document";
import packageJson from "../package.json";

export class DocumentPlugin extends EntityPlugin<DocumentEntity> {
  readonly entityType = documentAdapter.entityType;
  readonly schema = documentSchema;
  readonly adapter = documentAdapter;

  constructor() {
    super("document", packageJson, {}, undefined);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { embeddable: false };
  }
}

export function documentPlugin(): Plugin {
  return new DocumentPlugin();
}
