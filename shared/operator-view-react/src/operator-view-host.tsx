/** @jsxImportSource react */
import {
  OperatorTabStrip,
  OperatorTabButton,
  OperatorTabCount,
} from "./operator-tab-strip";
import {
  OperatorSegmentedGroup,
  OperatorSegmentedButton,
} from "./operator-segmented";
import { OperatorDisclosure } from "./operator-disclosure";
import { Button as AppButton } from "@brains/app-ui-react";
import { actionLayoutStyles as actionLayout } from "./operator-action-layout.styles";
import * as stylex from "@stylexjs/stylex";
import type {
  RuntimeStudioOperatorView,
  RuntimeOperatorActionControl,
  RuntimeOperatorLinkTarget,
} from "@brains/plugins";
import {
  createContext,
  type ButtonHTMLAttributes,
  type ComponentType,
  type Context,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  ConfirmDialog as CssConfirmDialog,
  type ConfirmDialogProps,
} from "./confirm-dialog";

export type OperatorViewQuery = Readonly<
  Record<string, string | number | undefined>
>;

export type RuntimeBlock = RuntimeStudioOperatorView["blocks"][number];

export type OperatorControlVariant =
  "primary" | "secondary" | "danger" | "ghost" | "link";

interface OperatorControlPresentationProps {
  xstyle?: stylex.StyleXStyles;
}

export interface OperatorControlButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    OperatorControlPresentationProps {
  variant?: OperatorControlVariant | undefined;
}

export interface OperatorTabsProps {
  label: string;
  value: string;
  tabs: readonly {
    value: string;
    label: ReactNode;
    count?: number | undefined;
    content: ReactNode;
  }[];
  onValueChange: (value: string) => void;
}

export interface OperatorDisclosureProps {
  triggerVariant?: "outline" | "link" | "primary" | undefined;
  /** CSS-host presentation; app hosts retain their dialog presentation. */
  presentation?: "action" | undefined;
  title: string;
  triggerLabel: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}

export interface OperatorViewComponents {
  readonly engine: "css" | "app";
  /** Readout spacing is independent of the host's control implementation. */
  readonly density: "compact" | "comfortable";
  readonly Button: ComponentType<OperatorControlButtonProps>;
  readonly Input: ComponentType<
    InputHTMLAttributes<HTMLInputElement> & OperatorControlPresentationProps
  >;
  readonly Select: ComponentType<
    SelectHTMLAttributes<HTMLSelectElement> & OperatorControlPresentationProps
  >;
  readonly ConfirmDialog: ComponentType<ConfirmDialogProps>;
  readonly Disclosure: ComponentType<OperatorDisclosureProps>;
  readonly Tabs: ComponentType<OperatorTabsProps>;
}

function CssButton({
  variant = "primary",
  className,
  xstyle,
  style,
  ...props
}: OperatorControlButtonProps): ReactElement {
  if (variant !== "link")
    return (
      <AppButton
        variant={variant}
        xstyle={xstyle}
        className={className}
        style={style}
        {...props}
      />
    );
  const styleProps = stylex.props(actionLayout.link, xstyle);
  return (
    <button
      className={[styleProps.className, className].filter(Boolean).join(" ")}
      style={{ ...styleProps.style, ...style }}
      {...props}
    />
  );
}

function CssInput({
  xstyle,
  className,
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> &
  OperatorControlPresentationProps): ReactElement {
  const styleProps = stylex.props(xstyle);
  return (
    <input
      className={[styleProps.className, className].filter(Boolean).join(" ")}
      style={{ ...styleProps.style, ...style }}
      {...props}
    />
  );
}

function CssSelect({
  xstyle,
  className,
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> &
  OperatorControlPresentationProps): ReactElement {
  const styleProps = stylex.props(xstyle);
  return (
    <select
      className={[styleProps.className, className].filter(Boolean).join(" ")}
      style={{ ...styleProps.style, ...style }}
      {...props}
    />
  );
}

function CssDisclosure(props: OperatorDisclosureProps): ReactElement {
  return (
    <OperatorDisclosure
      className={props.className}
      triggerLabel={props.triggerLabel}
      triggerVariant={props.triggerVariant}
      presentation={props.presentation}
    >
      {props.children}
    </OperatorDisclosure>
  );
}

function CssTabs(props: OperatorTabsProps): ReactElement {
  const active = props.tabs.find((tab) => tab.value === props.value);
  return (
    <div className="declarative-tabs">
      <OperatorSegmentedGroup role="tablist" aria-label={props.label}>
        {props.tabs.map((tab) => (
          <OperatorSegmentedButton
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={tab.value === active?.value}
            onClick={() => props.onValueChange(tab.value)}
          >
            {tab.label}
            {tab.count !== undefined ? ` (${tab.count})` : ""}
          </OperatorSegmentedButton>
        ))}
      </OperatorSegmentedGroup>
      {active && <div role="tabpanel">{active.content}</div>}
    </div>
  );
}

export function StaticAllTabs(props: {
  id: string;
  label: string;
  defaultValue: string;
  tabs: OperatorTabsProps["tabs"];
}): ReactElement {
  return (
    <div data-ui-tabs data-ui-tabs-default={props.defaultValue}>
      <OperatorTabStrip className="widget-tabs" aria-label={props.label}>
        {props.tabs.map((tab) => {
          const active = tab.value === props.defaultValue;
          return (
            <OperatorTabButton
              key={tab.value}
              id={`${props.id}-tab-${tab.value}`}
              className="widget-tab"
              type="button"
              role="tab"
              data-ui-tab={tab.value}
              aria-controls={`${props.id}-panel-${tab.value}`}
              aria-selected={active}
            >
              {tab.label}
              {tab.count !== undefined && (
                <OperatorTabCount className="widget-tab-count">
                  {tab.count}
                </OperatorTabCount>
              )}
            </OperatorTabButton>
          );
        })}
      </OperatorTabStrip>
      {props.tabs.map((tab) => {
        const active = tab.value === props.defaultValue;
        return (
          <div
            key={tab.value}
            id={`${props.id}-panel-${tab.value}`}
            className={active ? "is-active" : undefined}
            data-ui-panel={tab.value}
            role="tabpanel"
            aria-labelledby={`${props.id}-tab-${tab.value}`}
            hidden={!active}
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}

export const CSS_COMPONENTS: OperatorViewComponents = {
  engine: "css",
  density: "compact",
  Button: CssButton,
  Input: CssInput,
  Select: CssSelect,
  ConfirmDialog: CssConfirmDialog,
  Disclosure: CssDisclosure,
  Tabs: CssTabs,
};

interface OperatorRendererHost {
  readonly resolveLink?:
    ((target: RuntimeOperatorLinkTarget) => string | undefined) | undefined;
  readonly onDetachedActionResult?:
    ((result: PresentedActionResult) => void) | undefined;
  readonly renderAllTabs: boolean;
  readonly components: OperatorViewComponents;
}

export const OperatorRendererHostContext: Context<OperatorRendererHost> =
  createContext<OperatorRendererHost>({
    renderAllTabs: false,
    components: CSS_COMPONENTS,
  });

/**
 * A detail target names no block, so the handler comes from the enclosing
 * detail rather than from a prop threaded through every collection. Outside a
 * detail the context is absent and the link renders inert.
 */
export const OpenDetailContext: Context<((itemId: string) => void) | null> =
  createContext<((itemId: string) => void) | null>(null);

export type OperatorJsonValue = RuntimeOperatorActionControl["input"];

interface PresentedActionResultField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly copyable: boolean;
  readonly sensitive: boolean;
}

export interface PresentedActionResult {
  readonly title: string;
  readonly fields: readonly PresentedActionResultField[];
}
