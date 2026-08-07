import type { ApiRouteDefinition } from "./api-routes";
import type {
  WebRouteHandler,
  WebRouteMatch,
  WebRouteMethod,
} from "./web-routes";

export type SharedHostAdmission = "admit" | "deny";

interface RegisteredHttpRouteBase {
  ownerPluginId: string;
  fullPath: string;
  method: WebRouteMethod;
  match: WebRouteMatch;
  sharedHostAdmission: SharedHostAdmission;
}

export interface RegisteredHandlerHttpRoute extends RegisteredHttpRouteBase {
  kind: "handler";
  handler: WebRouteHandler;
}

export interface RegisteredToolHttpRoute extends RegisteredHttpRouteBase {
  kind: "tool";
  match: "exact";
  definition: ApiRouteDefinition;
}

export type RegisteredHttpRoute =
  RegisteredHandlerHttpRoute | RegisteredToolHttpRoute;

export interface HttpRouteManifestEntry {
  ownerPluginId: string;
  kind: RegisteredHttpRoute["kind"];
  method: WebRouteMethod;
  fullPath: string;
  match: WebRouteMatch;
  sharedHostAdmission: SharedHostAdmission;
}
