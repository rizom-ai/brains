// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

/**
 * Schema for list item
 */
const listItemSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
});

/**
 * Schema for list widget data
 */
const listDataSchema = z.object({
  jobs: z.array(listItemSchema).optional(),
  batches: z.array(listItemSchema).optional(),
  items: z.array(listItemSchema).optional(),
});

type ListItem = z.infer<typeof listItemSchema>;

export type ListWidgetProps = BaseWidgetProps;

/**
 * List widget renderer - displays a list of items (jobs, batches, etc.)
 */
export function ListWidget({
  title,
  description,
  data,
}: ListWidgetProps): VNode {
  const parsed = listDataSchema.safeParse(data);

  const jobs = parsed.success ? (parsed.data.jobs ?? []) : [];
  const batches = parsed.success ? (parsed.data.batches ?? []) : [];
  const items = parsed.success ? (parsed.data.items ?? []) : [];
  const allItems: ListItem[] = [...jobs, ...batches, ...items];

  return (
    <div className="widget-container">
      <h3 className="text-lg font-semibold mb-3 text-theme">{title}</h3>
      {description && (
        <p className="text-sm text-theme-muted mb-3">{description}</p>
      )}
      {allItems.length === 0 ? (
        <p className="text-theme-muted text-sm">No active items</p>
      ) : (
        <div className="space-y-2">
          {allItems.map((item) => (
            <div
              key={item.id}
              className="bg-theme p-2 rounded-lg border border-theme text-sm"
            >
              <span className="text-theme">
                {item.type ?? item.name ?? item.id}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
