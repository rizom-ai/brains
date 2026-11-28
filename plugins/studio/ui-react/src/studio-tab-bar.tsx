/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type ReactElement } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { isPlainLinkClick } from "./link-click";
import type { PhoneTab, PhoneTabOption } from "./phone-tabs";
import { StudioAreaMark } from "./studio-desktop-navigation";
import { tabBarStyles as s } from "./studio-tab-bar.styles";

/**
 * The phone's tab bar: a tab per section, opening its first page. Tapping the
 * tab of the section you are in opens its other pages in a sheet above the
 * bar. Links stay links, so a page opens in a new tab like any other.
 */
export function StudioTabBar(props: {
  tabs: readonly PhoneTab[];
  activeValue: string;
  onSelect: (value: string) => void;
}): ReactElement {
  const [sheet, setSheet] = useState<PhoneTab | null>(null);
  const returnFocus = useRef<HTMLAnchorElement | null>(null);

  const choose = (option: PhoneTabOption): void => {
    setSheet(null);
    props.onSelect(option.value);
  };

  return (
    <>
      <nav
        {...stylex.props(s.bar)}
        aria-label="Studio sections"
        data-studio-tab-bar=""
      >
        {props.tabs.map((tab) => (
          <a
            key={tab.area}
            href={tab.main.href}
            {...stylex.props(s.tab, tab.active && s.active)}
            aria-current={tab.active ? "page" : undefined}
            aria-haspopup={
              tab.active && tab.options.length > 1 ? "dialog" : undefined
            }
            aria-label={
              tab.attention > 0
                ? `${tab.label}, ${tab.attention} need you`
                : tab.label
            }
            data-studio-tab={tab.area}
            onClick={(event) => {
              if (!isPlainLinkClick(event)) return;
              event.preventDefault();
              // In the section already: its other pages, when it has any.
              if (tab.active && tab.options.length > 1) {
                returnFocus.current = event.currentTarget;
                setSheet(tab);
                return;
              }
              choose(tab.main);
            }}
          >
            <span {...stylex.props(s.icon)}>
              <StudioAreaMark area={tab.area} />
            </span>
            {tab.label}
            {tab.attention > 0 && (
              <span {...stylex.props(s.light)} aria-hidden="true" />
            )}
          </a>
        ))}
      </nav>
      <DialogPrimitive.Root
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay {...stylex.props(s.overlay)} />
          <DialogPrimitive.Content
            {...stylex.props(s.sheet)}
            className={`studio-tab-sheet ${stylex.props(s.sheet).className ?? ""}`}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocus.current?.focus();
            }}
          >
            <div {...stylex.props(s.sheetHead)}>
              <DialogPrimitive.Title {...stylex.props(s.sheetTitle)}>
                {sheet?.label}
              </DialogPrimitive.Title>
            </div>
            <ul {...stylex.props(s.sheetList)}>
              {sheet?.options.map((option) => {
                const current = option.value === props.activeValue;
                return (
                  <li key={option.value}>
                    <a
                      href={option.href}
                      {...stylex.props(s.option, current && s.optionActive)}
                      aria-current={current ? "page" : undefined}
                      aria-label={option.accessibleLabel}
                      data-studio-tab-option={option.value}
                      onClick={(event) => {
                        if (!isPlainLinkClick(event)) return;
                        event.preventDefault();
                        choose(option);
                      }}
                    >
                      {option.label}
                      {(option.attention ?? 0) > 0 ? (
                        <span
                          {...stylex.props(s.optionCount, s.optionAttention)}
                        >
                          {option.attention} need you
                        </span>
                      ) : option.tally !== undefined ? (
                        <span {...stylex.props(s.optionCount)}>
                          {option.tally}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
