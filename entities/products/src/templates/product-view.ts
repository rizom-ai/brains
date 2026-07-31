import type { OverviewWithData } from "../schemas/overview";
import type { EnrichedProduct } from "../schemas/product";

type JsonReady<T> = T extends undefined
  ? null
  : T extends readonly (infer Item)[]
    ? JsonReady<Item>[]
    : T extends object
      ? { [K in keyof T]-?: JsonReady<T[K]> }
      : T;

export type OverviewView = JsonReady<OverviewWithData>;
export type ProductSchemaData = JsonReady<EnrichedProduct>;
export type ProductView = Omit<
  ProductSchemaData,
  "url" | "typeLabel" | "listUrl" | "listLabel"
> & {
  url: string;
  typeLabel: string;
  listUrl: string;
  listLabel: string;
};
