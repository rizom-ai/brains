/** @jsxImportSource preact */
import type { ComponentChildren, JSX } from "preact";

export function CardHeader({
  title,
  source,
  subtitle,
  children,
}: {
  title: ComponentChildren;
  source?: ComponentChildren;
  subtitle?: ComponentChildren;
  children?: ComponentChildren;
}): JSX.Element {
  const detail = source ? (
    <span class="card-from">{source}</span>
  ) : subtitle ? (
    <span class="card-subtitle">{subtitle}</span>
  ) : (
    children
  );

  return (
    <div class="card-head">
      <span class="card-title">{title}</span>
      {detail}
    </div>
  );
}

export interface KeyValueItem {
  label: ComponentChildren;
  value: ComponentChildren;
}

export function KeyValueList({
  items,
}: {
  items: KeyValueItem[];
}): JSX.Element {
  return (
    <dl class="kv">
      {items.map((item, index) => (
        <div class="kv-row" key={index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  children = "Nothing to show yet.",
}: {
  children?: ComponentChildren;
}): JSX.Element {
  return <p class="muted">{children}</p>;
}
