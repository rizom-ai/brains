/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Dialog, DialogContent, DialogTitle } from "@brains/app-ui-react";
import { VisuallyHidden } from "radix-ui";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { StudioPalette as StudioPaletteResult } from "../../src/palette-contract";
import {
  paletteSections,
  stepActive,
  type PaletteCommand,
  type PaletteType,
} from "./palette-model";
import { useStudioApi } from "./studio-api-context";
import { OPEN_STUDIO_PALETTE_EVENT } from "./palette-events";
import { paletteStyles as s } from "./studio-palette.styles";

/** Wait this long after typing before asking Studio, as the old palette did. */
const SEARCH_DELAY_MS = 150;

/**
 * ⌘K in Studio: what is open, what can be done, and where to go. Studio
 * answers the pages and entries for the signed-in caller, whatever their
 * role; the palette adds what the page itself can do.
 */
export function StudioPalette(props: {
  types: readonly PaletteType[];
  hasChat: boolean;
  openEntry: { typeLabel: string } | null;
  onCommand: (command: PaletteCommand) => void;
}): ReactElement {
  const api = useStudioApi();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<StudioPaletteResult | null>(null);
  const [active, setActive] = useState(0);

  // ⌘K anywhere, and the chrome's chip, open it.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    const chip = (): void => setOpen(true);
    window.addEventListener("keydown", keydown);
    window.addEventListener(OPEN_STUDIO_PALETTE_EVENT, chip);
    return (): void => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener(OPEN_STUDIO_PALETTE_EVENT, chip);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let current = true;
    const timer = window.setTimeout(() => {
      api
        .fetchPalette(query)
        .then((result) => {
          if (current) setRemote(result);
        })
        .catch(() => {
          if (current) setRemote(null);
        });
    }, SEARCH_DELAY_MS);
    return (): void => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [api, open, query]);

  const sections = useMemo(
    () =>
      paletteSections({
        query,
        types: props.types,
        hasChat: props.hasChat,
        openEntry: props.openEntry,
        remote,
      }),
    [query, props.types, props.hasChat, props.openEntry, remote],
  );
  const items = sections.flatMap((section) => section.items);
  const activeIndex = Math.min(active, items.length - 1);

  const close = (): void => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  const choose = (command: PaletteCommand): void => {
    close();
    props.onCommand(command);
  };
  const keydown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        stepActive(
          activeIndex,
          event.key === "ArrowDown" ? 1 : -1,
          items.length,
        ),
      );
    } else if (event.key === "Enter") {
      const item = items[activeIndex];
      if (!item) return;
      event.preventDefault();
      choose(item.command);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        data-studio-palette=""
        {...stylex.props(s.content)}
      >
        {/* The field says what this is; the title is for assistive tech. */}
        <VisuallyHidden.Root>
          <DialogTitle>Search or run a command</DialogTitle>
        </VisuallyHidden.Root>
        <div {...stylex.props(s.field)}>
          <input
            {...stylex.props(s.input)}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              items[activeIndex] ? `${listId}-${activeIndex}` : undefined
            }
            aria-label="Search or run a command"
            placeholder="Search or do…"
            value={query}
            autoFocus
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={keydown}
          />
        </div>
        <div {...stylex.props(s.list)} id={listId} role="listbox">
          {items.length === 0 ? (
            <p {...stylex.props(s.empty)}>Nothing matches “{query.trim()}”.</p>
          ) : (
            sections.map((section) => (
              <div
                key={section.id}
                role="group"
                aria-labelledby={`${listId}-${section.id}`}
                {...stylex.props(s.section)}
              >
                <div
                  id={`${listId}-${section.id}`}
                  role="presentation"
                  {...stylex.props(s.label)}
                >
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      data-palette-item={item.id}
                      {...stylex.props(
                        s.item,
                        index === activeIndex && s.active,
                      )}
                      onMouseMove={() => setActive(index)}
                      onClick={() => choose(item.command)}
                    >
                      <span {...stylex.props(s.title)}>{item.title}</span>
                      {item.sub && (
                        <span {...stylex.props(s.sub)}>{item.sub}</span>
                      )}
                      {item.kbd && (
                        <kbd {...stylex.props(s.kbd)}>{item.kbd}</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
