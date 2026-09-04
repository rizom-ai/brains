/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import {
  AlertDialog as AlertDialogPrimitive,
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
  Select as SelectPrimitive,
  Tabs as TabsPrimitive,
} from "radix-ui";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button } from "./controls";

function classes(...values: Array<string | undefined>): string | undefined {
  const value = values.filter(Boolean).join(" ");
  return value || undefined;
}

const styles = stylex.create({
  overlay: {
    backgroundColor:
      "color-mix(in srgb, var(--console-bg-deep) 68%, transparent)",
    backdropFilter: "blur(4px)",
    inset: 0,
    position: "fixed",
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: "var(--console-card)",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "14px",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow:
      "0 32px 80px -28px color-mix(in srgb, var(--console-bg-deep) 72%, transparent)",
    color: "var(--console-text)",
    display: "grid",
    gap: "16px",
    left: "50%",
    maxHeight: "min(84dvh, 720px)",
    maxWidth: "calc(100vw - 32px)",
    outline: "none",
    overflowY: "auto",
    padding: "24px",
    position: "fixed",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "min(520px, calc(100vw - 32px))",
    zIndex: 1001,
    "@media (max-width: 640px)": {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      bottom: 0,
      gap: "14px",
      left: 0,
      maxHeight: "min(88dvh, 760px)",
      maxWidth: "none",
      paddingBlockEnd: "calc(20px + env(safe-area-inset-bottom))",
      paddingInline: "18px",
      top: "auto",
      transform: "none",
      width: "100%",
    },
  },
  dialogTitle: {
    color: "var(--console-text)",
    fontFamily: "var(--console-display)",
    fontSize: "22px",
    fontWeight: 500,
    lineHeight: 1.15,
    margin: 0,
  },
  dialogDescription: {
    color: "var(--console-text-dim)",
    fontSize: "14px",
    lineHeight: 1.55,
    margin: 0,
  },
  dialogHeader: { display: "grid", gap: "7px", paddingInlineEnd: "32px" },
  dialogFooter: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    "@media (max-width: 640px)": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
    },
  },
  close: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: "7px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: "var(--console-text-muted)",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "var(--console-mono)",
    fontSize: "18px",
    height: "32px",
    justifyContent: "center",
    outline: "none",
    position: "absolute",
    right: "14px",
    top: "14px",
    width: "32px",
    ":hover": {
      backgroundColor: "var(--console-rule)",
      color: "var(--console-text)",
    },
    ":focus-visible": {
      borderColor: "var(--console-accent)",
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-accent) 20%, transparent)",
    },
  },
  mark: {
    alignItems: "center",
    backgroundColor: "color-mix(in srgb, var(--console-err) 12%, transparent)",
    borderRadius: "50%",
    color: "var(--console-err)",
    display: "inline-flex",
    fontFamily: "var(--console-mono)",
    fontSize: "18px",
    height: "36px",
    justifyContent: "center",
    width: "36px",
  },
  disclosureTrigger: { justifySelf: "start" },
  tabsList: {
    borderBottomColor: "var(--console-rule-strong)",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    display: "flex",
    gap: "4px",
    overflowX: "auto",
  },
  tabsTrigger: {
    appearance: "none",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 0,
    borderBottomWidth: "2px",
    color: "var(--console-text-muted)",
    cursor: "pointer",
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
    fontWeight: 600,
    minHeight: "40px",
    outline: "none",
    paddingInline: "12px",
    whiteSpace: "nowrap",
    ":hover": { color: "var(--console-text)" },
    ":focus-visible": {
      boxShadow:
        "inset 0 0 0 2px color-mix(in srgb, var(--console-accent) 35%, transparent)",
    },
    ":is([data-state='active'])": {
      borderBottomColor: "var(--console-accent)",
      color: "var(--console-text)",
    },
  },
  tabsPanel: { outline: "none", paddingBlockStart: "16px" },
  popup: {
    backgroundColor: "var(--console-card)",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "9px",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow:
      "0 18px 48px -22px color-mix(in srgb, var(--console-bg-deep) 76%, transparent)",
    color: "var(--console-text)",
    maxHeight: "var(--radix-dropdown-menu-content-available-height, 320px)",
    minWidth: "180px",
    overflowY: "auto",
    padding: "5px",
    zIndex: 1100,
  },
  menuItem: {
    alignItems: "center",
    borderRadius: "6px",
    color: "var(--console-text-dim)",
    cursor: "default",
    display: "flex",
    fontFamily: "var(--console-ui)",
    fontSize: "13px",
    gap: "8px",
    minHeight: "34px",
    outline: "none",
    paddingBlock: "7px",
    paddingInline: "9px",
    position: "relative",
    userSelect: "none",
    ":focus": {
      backgroundColor: "var(--console-rule)",
      color: "var(--console-text)",
    },
    ":is([data-disabled])": { opacity: 0.45, pointerEvents: "none" },
  },
  menuDanger: {
    color: "var(--console-err)",
    ":focus": {
      backgroundColor:
        "color-mix(in srgb, var(--console-err) 11%, transparent)",
      color: "var(--console-err)",
    },
  },
  menuInset: { paddingInlineStart: "30px" },
  menuLabel: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: "10px",
    letterSpacing: "0.1em",
    paddingBlock: "7px 5px",
    paddingInline: "9px",
    textTransform: "uppercase",
  },
  menuSeparator: {
    backgroundColor: "var(--console-rule)",
    height: "1px",
    marginBlock: "4px",
  },
  menuIndicator: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    left: "9px",
    position: "absolute",
    width: "14px",
  },
  menuShortcut: {
    color: "var(--console-text-muted)",
    fontFamily: "var(--console-mono)",
    fontSize: "10px",
    marginInlineStart: "auto",
  },
  selectTrigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "var(--console-card)",
    borderColor: "var(--console-rule-strong)",
    borderRadius: "7px",
    borderStyle: "solid",
    borderWidth: "1px",
    color: "var(--console-text)",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "var(--console-ui)",
    fontSize: "16px",
    gap: "8px",
    justifyContent: "space-between",
    minHeight: "40px",
    minWidth: "160px",
    outline: "none",
    paddingInline: "11px",
    ":focus-visible": {
      borderColor: "var(--console-accent)",
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--console-accent) 18%, transparent)",
    },
    ":is([data-placeholder])": { color: "var(--console-text-muted)" },
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  selectSm: { fontSize: "13px", minHeight: "34px" },
  selectContent: {
    maxHeight: "var(--radix-select-content-available-height, 320px)",
    minWidth: "var(--radix-select-trigger-width, 180px)",
  },
  selectViewport: { padding: "5px" },
  selectItem: { paddingInlineEnd: "30px" },
  scrollButton: {
    alignItems: "center",
    color: "var(--console-text-muted)",
    display: "flex",
    height: "28px",
    justifyContent: "center",
  },
});

export function Dialog(
  props: ComponentProps<typeof DialogPrimitive.Root>,
): ReactElement {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(
  props: ComponentProps<typeof DialogPrimitive.Trigger>,
): ReactElement {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal(
  props: ComponentProps<typeof DialogPrimitive.Portal>,
): ReactElement {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose(
  props: ComponentProps<typeof DialogPrimitive.Close>,
): ReactElement {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>): ReactElement {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={classes(stylex.props(styles.overlay).className, className)}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean | undefined;
}): ReactElement {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={classes(stylex.props(styles.dialog).className, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={stylex.props(styles.close).className}
            aria-label="Close"
          >
            ×
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({
  className,
  ...props
}: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="dialog-header"
      className={classes(
        stylex.props(styles.dialogHeader).className,
        className,
      )}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: ComponentProps<"div"> & {
  showCloseButton?: boolean | undefined;
}): ReactElement {
  return (
    <div
      data-slot="dialog-footer"
      className={classes(
        stylex.props(styles.dialogFooter).className,
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>): ReactElement {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={classes(stylex.props(styles.dialogTitle).className, className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>): ReactElement {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={classes(
        stylex.props(styles.dialogDescription).className,
        className,
      )}
      {...props}
    />
  );
}

export interface ConfirmDialogProps {
  mark: string;
  title: string;
  titleId: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pending?: boolean | undefined;
  sectionClassName?: string | undefined;
  confirmVariant?: "primary" | "danger" | undefined;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): ReactElement {
  const pending = props.pending === true;
  return (
    <AlertDialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) props.onCancel();
      }}
    >
      <AlertDialogPrimitive.Overlay
        className={stylex.props(styles.overlay).className}
      />
      <AlertDialogPrimitive.Content
        className={classes(
          stylex.props(styles.dialog).className,
          "delete-modal",
          props.sectionClassName,
        )}
        aria-labelledby={props.titleId}
      >
        <span className={stylex.props(styles.mark).className} aria-hidden>
          {props.mark}
        </span>
        <AlertDialogPrimitive.Title
          id={props.titleId}
          className={stylex.props(styles.dialogTitle).className}
        >
          {props.title}
        </AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description asChild>
          <div>{props.children}</div>
        </AlertDialogPrimitive.Description>
        <div className={stylex.props(styles.dialogFooter).className}>
          <AlertDialogPrimitive.Cancel asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {props.cancelLabel}
            </Button>
          </AlertDialogPrimitive.Cancel>
          <Button
            type="button"
            variant={props.confirmVariant ?? "primary"}
            disabled={pending}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Root>
  );
}

export function DisclosureSheet(props: {
  title: string;
  triggerLabel: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}): ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={classes(
            stylex.props(styles.disclosureTrigger).className,
            props.className,
          )}
        >
          {props.triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent aria-label={props.title}>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        {props.children}
      </DialogContent>
    </Dialog>
  );
}

export function Tabs(
  props: ComponentProps<typeof TabsPrimitive.Root>,
): ReactElement {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>): ReactElement {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={classes(stylex.props(styles.tabsList).className, className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): ReactElement {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={classes(stylex.props(styles.tabsTrigger).className, className)}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>): ReactElement {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={classes(stylex.props(styles.tabsPanel).className, className)}
      {...props}
    />
  );
}

export interface AppTabDefinition {
  value: string;
  label: ReactNode;
  count?: number | undefined;
  content: ReactNode;
}

export function AppTabs(props: {
  label: string;
  value: string;
  tabs: readonly AppTabDefinition[];
  onValueChange: (value: string) => void;
}): ReactElement {
  return (
    <TabsPrimitive.Root value={props.value} onValueChange={props.onValueChange}>
      <TabsPrimitive.List
        aria-label={props.label}
        className={stylex.props(styles.tabsList).className}
      >
        {props.tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className={stylex.props(styles.tabsTrigger).className}
          >
            {tab.label}
            {tab.count !== undefined ? ` (${tab.count})` : ""}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {props.tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.value}
          value={tab.value}
          className={stylex.props(styles.tabsPanel).className}
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export function DropdownMenu(
  props: ComponentProps<typeof DropdownMenuPrimitive.Root>,
): ReactElement {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}
export function DropdownMenuPortal(
  props: ComponentProps<typeof DropdownMenuPrimitive.Portal>,
): ReactElement {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  );
}
export function DropdownMenuTrigger(
  props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
): ReactElement {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  );
}
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>): ReactElement {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={classes(stylex.props(styles.popup).className, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}
export function DropdownMenuGroup(
  props: ComponentProps<typeof DropdownMenuPrimitive.Group>,
): ReactElement {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}
export function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean | undefined;
  variant?: "default" | "destructive" | undefined;
}): ReactElement {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset === true ? true : undefined}
      data-variant={variant}
      className={classes(
        stylex.props(
          styles.menuItem,
          inset && styles.menuInset,
          variant === "destructive" && styles.menuDanger,
        ).className,
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>): ReactElement {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={classes(
        stylex.props(styles.menuItem, styles.menuInset).className,
        className,
      )}
      {...(checked === undefined ? {} : { checked })}
      {...props}
    >
      <span className={stylex.props(styles.menuIndicator).className}>
        <DropdownMenuPrimitive.ItemIndicator>
          ✓
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
export function DropdownMenuRadioGroup(
  props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
): ReactElement {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>): ReactElement {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={classes(
        stylex.props(styles.menuItem, styles.menuInset).className,
        className,
      )}
      {...props}
    >
      <span className={stylex.props(styles.menuIndicator).className}>
        <DropdownMenuPrimitive.ItemIndicator>
          •
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean | undefined;
}): ReactElement {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={classes(
        stylex.props(styles.menuLabel, inset && styles.menuInset).className,
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>): ReactElement {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={classes(
        stylex.props(styles.menuSeparator).className,
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuShortcut({
  className,
  ...props
}: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={classes(
        stylex.props(styles.menuShortcut).className,
        className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuSub(
  props: ComponentProps<typeof DropdownMenuPrimitive.Sub>,
): ReactElement {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}
export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean | undefined;
}): ReactElement {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={classes(
        stylex.props(styles.menuItem, inset && styles.menuInset).className,
        className,
      )}
      {...props}
    >
      {children}
      <span aria-hidden>›</span>
    </DropdownMenuPrimitive.SubTrigger>
  );
}
export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>): ReactElement {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={classes(stylex.props(styles.popup).className, className)}
      {...props}
    />
  );
}

export function Select(
  props: ComponentProps<typeof SelectPrimitive.Root>,
): ReactElement {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}
export function SelectGroup(
  props: ComponentProps<typeof SelectPrimitive.Group>,
): ReactElement {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}
export function SelectValue(
  props: ComponentProps<typeof SelectPrimitive.Value>,
): ReactElement {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}
export function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default" | undefined;
}): ReactElement {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={classes(
        stylex.props(styles.selectTrigger, size === "sm" && styles.selectSm)
          .className,
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon aria-hidden>⌄</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        className={classes(
          stylex.props(styles.popup, styles.selectContent).className,
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={stylex.props(styles.selectViewport).className}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>): ReactElement {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={classes(stylex.props(styles.menuLabel).className, className)}
      {...props}
    />
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>): ReactElement {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={classes(
        stylex.props(styles.menuItem, styles.selectItem).className,
        className,
      )}
      {...props}
    >
      <span className={stylex.props(styles.menuIndicator).className}>
        <SelectPrimitive.ItemIndicator>✓</SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>): ReactElement {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={classes(
        stylex.props(styles.menuSeparator).className,
        className,
      )}
      {...props}
    />
  );
}
export function SelectScrollUpButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpButton>): ReactElement {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={classes(
        stylex.props(styles.scrollButton).className,
        className,
      )}
      {...props}
    >
      ↑
    </SelectPrimitive.ScrollUpButton>
  );
}
export function SelectScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownButton>): ReactElement {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={classes(
        stylex.props(styles.scrollButton).className,
        className,
      )}
      {...props}
    >
      ↓
    </SelectPrimitive.ScrollDownButton>
  );
}
