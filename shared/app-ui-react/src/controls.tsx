/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Slot, Switch as SwitchPrimitive } from "radix-ui";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export type AppButtonVariant =
  | "default"
  | "primary"
  | "destructive"
  | "danger"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
export type AppButtonSize =
  "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

function classes(...values: Array<string | undefined>): string | undefined {
  const value = values.filter(Boolean).join(" ");
  return value || undefined;
}

const styles = stylex.create({
  button: {
    alignItems: "center",
    appearance: "none",
    borderStyle: "solid",
    borderWidth: "1px",
    borderRadius: "7px",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
    fontWeight: 600,
    gap: "8px",
    justifyContent: "center",
    lineHeight: 1,
    minHeight: "36px",
    outline: "none",
    paddingBlock: "8px",
    paddingInline: "14px",
    textDecoration: "none",
    transition:
      "background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, transform 120ms ease",
    whiteSpace: "nowrap",
    ":focus-visible": {
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-accent) 28%, transparent)",
    },
    ":disabled": {
      cursor: "not-allowed",
      opacity: 0.5,
      transform: "none",
    },
    "@media (max-width: 640px)": { minHeight: "var(--console-touch)" },
  },
  primary: {
    backgroundColor: "var(--console-accent)",
    borderColor: "var(--console-accent)",
    color: "var(--console-on-accent)",
    ":hover": {
      backgroundColor: "var(--console-accent-dim)",
      borderColor: "var(--console-accent-dim)",
      transform: "translateY(-1px)",
    },
  },
  secondary: {
    backgroundColor: "var(--console-card-soft)",
    borderColor: "var(--console-rule-strong)",
    color: "var(--console-text)",
    ":hover": {
      backgroundColor: "var(--console-rule-strong)",
      borderColor: "var(--console-rule-accent)",
    },
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: "var(--console-rule-strong)",
    color: "var(--console-text-dim)",
    ":hover": {
      backgroundColor: "var(--console-rule)",
      borderColor: "var(--console-rule-accent)",
      color: "var(--console-text)",
    },
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "var(--console-text-dim)",
    ":hover": {
      backgroundColor: "var(--console-rule)",
      color: "var(--console-text)",
    },
  },
  danger: {
    backgroundColor: "transparent",
    borderColor: "color-mix(in srgb, var(--console-err) 55%, transparent)",
    color: "var(--console-err)",
    ":hover": {
      backgroundColor:
        "color-mix(in srgb, var(--console-err) 12%, transparent)",
      borderColor: "var(--console-err)",
    },
    ":focus-visible": {
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-err) 24%, transparent)",
    },
  },
  link: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: "var(--console-accent)",
    minHeight: "auto",
    paddingBlock: "2px",
    paddingInline: 0,
    ":hover": { textDecoration: "underline" },
  },
  sizeXs: {
    borderRadius: "6px",
    fontSize: "11px",
    gap: "5px",
    minHeight: "28px",
    paddingBlock: "5px",
    paddingInline: "9px",
  },
  sizeSm: {
    fontSize: "12px",
    minHeight: "32px",
    paddingBlock: "6px",
    paddingInline: "11px",
  },
  sizeLg: {
    fontSize: "14px",
    minHeight: "42px",
    paddingBlock: "10px",
    paddingInline: "20px",
  },
  icon: {
    height: "36px",
    minHeight: "36px",
    padding: 0,
    width: "36px",
  },
  iconXs: {
    height: "28px",
    minHeight: "28px",
    padding: 0,
    width: "28px",
  },
  iconSm: {
    height: "32px",
    minHeight: "32px",
    padding: 0,
    width: "32px",
  },
  iconLg: {
    height: "42px",
    minHeight: "42px",
    padding: 0,
    width: "42px",
  },
  control: {
    appearance: "none",
    backgroundColor: "var(--console-card)",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "7px",
    borderStyle: "solid",
    borderWidth: "1px",
    boxSizing: "border-box",
    color: "var(--console-text)",
    fontFamily: "var(--console-ui)",
    fontSize: "16px",
    lineHeight: 1.35,
    minHeight: "40px",
    minWidth: 0,
    outline: "none",
    paddingBlock: "8px",
    paddingInline: "11px",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
    width: "100%",
    "::placeholder": { color: "var(--console-text-muted)" },
    ":focus": {
      borderColor: "var(--console-accent)",
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-accent) 18%, transparent)",
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.55 },
    ":user-invalid": {
      borderColor: "var(--console-err)",
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-err) 14%, transparent)",
    },
  },
  select: {
    backgroundImage:
      "linear-gradient(45deg, transparent 50%, var(--console-text-muted) 50%), linear-gradient(135deg, var(--console-text-muted) 50%, transparent 50%)",
    backgroundPosition:
      "calc(100% - 15px) calc(50% - 2px), calc(100% - 10px) calc(50% - 2px)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "5px 5px, 5px 5px",
    paddingInlineEnd: "30px",
  },
  textarea: { minHeight: "88px", resize: "vertical" },
  switchRoot: {
    appearance: "none",
    backgroundColor: "var(--console-card-soft)",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    cursor: "pointer",
    display: "inline-flex",
    height: "24px",
    outline: "none",
    padding: "2px",
    transition: "background-color 120ms ease, border-color 120ms ease",
    width: "42px",
    ":focus-visible": {
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-accent) 24%, transparent)",
    },
    ":is([data-state='checked'])": {
      backgroundColor: "var(--console-accent)",
      borderColor: "var(--console-accent)",
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  switchThumb: {
    backgroundColor: "var(--console-text-dim)",
    borderRadius: "50%",
    display: "block",
    height: "18px",
    transform: "translateX(0)",
    transition: "transform 120ms ease, background-color 120ms ease",
    width: "18px",
    ":is([data-state='checked'])": {
      backgroundColor: "var(--console-on-accent)",
      transform: "translateX(18px)",
    },
  },
});

function buttonStyles(
  variant: AppButtonVariant,
  size: AppButtonSize,
): stylex.StyleXStyles[] {
  const tone =
    variant === "default" || variant === "primary"
      ? styles.primary
      : variant === "destructive" || variant === "danger"
        ? styles.danger
        : variant === "secondary"
          ? styles.secondary
          : variant === "ghost"
            ? styles.ghost
            : variant === "link"
              ? styles.link
              : styles.outline;
  const sizeStyle =
    size === "xs"
      ? styles.sizeXs
      : size === "sm"
        ? styles.sizeSm
        : size === "lg"
          ? styles.sizeLg
          : size === "icon"
            ? styles.icon
            : size === "icon-xs"
              ? styles.iconXs
              : size === "icon-sm"
                ? styles.iconSm
                : size === "icon-lg"
                  ? styles.iconLg
                  : undefined;
  return sizeStyle ? [styles.button, tone, sizeStyle] : [styles.button, tone];
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AppButtonVariant | undefined;
  size?: AppButtonSize | undefined;
  asChild?: boolean | undefined;
}

export function buttonClassName(
  variant: AppButtonVariant = "default",
  size: AppButtonSize = "default",
): string {
  return stylex.props(...buttonStyles(variant, size)).className ?? "";
}

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps): ReactElement {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes(buttonClassName(variant, size), className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  const styleProps = stylex.props(styles.control);
  return (
    <input
      data-slot="input"
      className={classes(styleProps.className, className)}
      {...props}
    />
  );
}

export function NativeSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): ReactElement {
  const styleProps = stylex.props(styles.control, styles.select);
  return (
    <select
      data-slot="native-select"
      className={classes(styleProps.className, className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactElement {
  const styleProps = stylex.props(styles.control, styles.textarea);
  return (
    <textarea
      data-slot="textarea"
      className={classes(styleProps.className, className)}
      {...props}
    />
  );
}

export type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...props }: SwitchProps): ReactElement {
  const rootProps = stylex.props(styles.switchRoot);
  const thumbProps = stylex.props(styles.switchThumb);
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={classes(rootProps.className, className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={thumbProps.className}
      />
    </SwitchPrimitive.Root>
  );
}
