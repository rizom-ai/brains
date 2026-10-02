import { BaseEntityAdapter } from "@brains/plugins";
import {
  NETWORK_PIECE_ENTITY_TYPE,
  networkPieceFrontmatterSchema,
  networkPieceSchema,
  type NetworkPieceEntity,
  type NetworkPieceKind,
  type NetworkPieceMetadata,
} from "../schemas/network-piece";

/** The kind a record collection files under, from its lexicon name. */
export function kindOfCollection(collection: string): NetworkPieceKind | null {
  const tail = collection.split(".").pop() ?? "";
  if (tail === "socialPost") return "social-post";
  const kinds: NetworkPieceKind[] = [
    "post",
    "deck",
    "project",
    "note",
    "link",
    "series",
    "topic",
  ];
  return kinds.find((kind) => kind === tail) ?? null;
}

/** A piece's id: its brain, kind and record, in characters safe for a file name. */
export function networkPieceId(
  repoDid: string,
  collection: string,
  rkey: string,
): string {
  const safe = (value: string): string =>
    value.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const brain = safe(repoDid.replace(/^did:plc:/, "plc-").replace(/^did:/, ""));
  return `${brain}--${kindOfCollection(collection) ?? safe(collection)}--${safe(rkey)}`;
}

export class NetworkPieceAdapter extends BaseEntityAdapter<
  NetworkPieceEntity,
  NetworkPieceMetadata,
  NetworkPieceMetadata
> {
  constructor() {
    super({
      entityType: NETWORK_PIECE_ENTITY_TYPE,
      purpose:
        "Another brain's published record, kept here to answer visitors and cited to that brain.",
      schema: networkPieceSchema,
      frontmatterSchema: networkPieceFrontmatterSchema,
      publishedStatuses: ["published"],
    });
  }

  public fromMarkdown(markdown: string): Partial<NetworkPieceEntity> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      networkPieceFrontmatterSchema,
    );
    return {
      content: markdown,
      entityType: NETWORK_PIECE_ENTITY_TYPE,
      metadata: frontmatter,
    };
  }

  public override extractMetadata(
    entity: NetworkPieceEntity,
  ): NetworkPieceMetadata {
    return entity.metadata;
  }
}
