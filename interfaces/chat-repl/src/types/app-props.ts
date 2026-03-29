import type { JobProgressEvent } from "@brains/plugins";

/**
 * Props for the EnhancedApp component
 * Extracted to avoid circular dependency between cli-interface and EnhancedApp
 */
export interface ICLIInterface {
  processInput(input: string): Promise<void>;
}

export interface EnhancedAppProps {
  interface: ICLIInterface;
  registerProgressCallback: (
    callback: (events: JobProgressEvent[]) => void,
  ) => void;
  unregisterProgressCallback: () => void;
  registerResponseCallback: (callback: (response: string) => void) => void;
  unregisterMessageCallbacks: () => void;
}
