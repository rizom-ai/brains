/** @jsxImportSource react */
import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import { StudioApi } from "./api";

/**
 * The Studio API client the tree talks through.
 *
 * main.tsx builds one for the mount the server rendered. The default is a
 * client for the default mount on the global fetch, so a tree rendered
 * without a provider behaves as before; a test provides one built on a fake
 * fetch and reads the requests off it.
 */
const StudioApiContext = createContext<StudioApi>(
  new StudioApi({ basePath: "/studio" }),
);

export function StudioApiProvider(props: {
  api: StudioApi;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <StudioApiContext.Provider value={props.api}>
      {props.children}
    </StudioApiContext.Provider>
  );
}

export function useStudioApi(): StudioApi {
  return useContext(StudioApiContext);
}
