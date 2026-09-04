import {
  AppTabs,
  Button,
  ConfirmDialog,
  DisclosureSheet,
  Input,
  NativeSelect,
} from "@brains/app-ui-react";
import type { OperatorViewComponents } from "@brains/operator-view-react";

/** Studio's adapter for the shared renderer's host-owned control seam. */
export const STUDIO_OPERATOR_COMPONENTS: OperatorViewComponents = {
  engine: "app",
  Button,
  Input,
  Select: NativeSelect,
  ConfirmDialog,
  Disclosure: DisclosureSheet,
  Tabs: AppTabs,
};
