export type AuthRouteHandler<TContext> = (
  request: Request,
  context: TContext,
) => Response | Promise<Response>;

export interface AuthRoute<TContext> {
  method: string;
  path: string;
  handler: AuthRouteHandler<TContext>;
}

export class AuthRouteTable<TContext> {
  private readonly routes = new Map<string, AuthRouteHandler<TContext>>();

  constructor(routes: AuthRoute<TContext>[]) {
    for (const route of routes) {
      const key = routeKey(route.method, route.path);
      if (this.routes.has(key)) {
        throw new Error(`Duplicate auth route: ${route.method} ${route.path}`);
      }
      this.routes.set(key, route.handler);
    }
  }

  async dispatch(
    request: Request,
    context: TContext,
  ): Promise<Response | undefined> {
    const path = new URL(request.url).pathname;
    const handler =
      this.routes.get(routeKey(request.method, path)) ??
      this.routes.get(routeKey("*", path));
    return handler ? handler(request, context) : undefined;
  }
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
