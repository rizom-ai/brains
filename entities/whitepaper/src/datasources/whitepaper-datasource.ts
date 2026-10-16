import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { Whitepaper, WhitepaperWithData } from "../schemas/whitepaper";
import { parseWhitepaperData } from "./parse-helpers";

interface WhitepaperDetailData {
  whitepaper: WhitepaperWithData;
  prevWhitepaper: WhitepaperWithData | null;
  nextWhitepaper: WhitepaperWithData | null;
}

interface WhitepaperListData {
  whitepapers: WhitepaperWithData[];
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
}

export class WhitepaperDataSource extends BaseEntityDataSource<
  Whitepaper,
  WhitepaperWithData
> {
  readonly id = "whitepaper:entities";
  readonly name = "Whitepaper Entity DataSource";
  readonly description =
    "Fetches and transforms whitepaper entities for rendering";

  protected readonly config = {
    entityType: "whitepaper",
    defaultSort: [
      { field: "publishedAt" as const, direction: "desc" as const },
    ],
    defaultLimit: 10,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: Whitepaper): WhitepaperWithData {
    return parseWhitepaperData(entity);
  }

  protected override buildDetailResult(
    item: WhitepaperWithData,
    navigation: NavigationResult<WhitepaperWithData> | null,
  ): WhitepaperDetailData {
    return {
      whitepaper: item,
      prevWhitepaper: navigation?.prev ?? null,
      nextWhitepaper: navigation?.next ?? null,
    };
  }

  protected buildListResult(
    items: WhitepaperWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): WhitepaperListData {
    return {
      whitepapers: items,
      pagination,
      baseUrl: query.baseUrl,
    };
  }
}
