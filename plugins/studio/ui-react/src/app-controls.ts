import {
  AppTabs,
  Button,
  ConfirmDialog,
  DisclosureSheet,
  Input,
  NativeSelect,
} from "@brains/app-ui-react";
import type { OperatorViewComponents } from "@brains/operator-view-react";
import { createElement, type ComponentProps, type ReactElement } from "react";
import * as stylex from "@stylexjs/stylex";
import { libraryStyles } from "./studio-library.styles";

/** Portals leave the Studio root, so give their form content the same readable tokens. */
function StudioDisclosure(
  props: ComponentProps<typeof DisclosureSheet>,
): ReactElement {
  return createElement(DisclosureSheet, {
    ...props,
    children: createElement(
      "div",
      stylex.props(libraryStyles.readable),
      props.children,
    ),
  });
}

/** Studio's adapter for the shared renderer's host-owned control seam. */
export const STUDIO_OPERATOR_COMPONENTS: OperatorViewComponents = {
  engine: "app",
  density: "comfortable",
  Button,
  Input,
  Select: NativeSelect,
  ConfirmDialog,
  Disclosure: StudioDisclosure,
  Tabs: AppTabs,
};
