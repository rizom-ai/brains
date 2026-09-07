// Local, read-only mockup server. Does not start or connect to a Brain.
const root = new URL("../../", import.meta.url).pathname;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 8096,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/")
      return Response.redirect("/docs/studio-workspaces/index.html", 302);
    const allowed =
      (path.startsWith("/docs/studio-workspaces/") &&
        /\.(html|css|js|md)$/.test(path)) ||
      (path.startsWith("/shared/") && path.endsWith(".css"));
    if (!allowed || path.includes("..") || /%|\\/.test(path))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(`${root}${path}`);
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
console.log(
  `Mockups: http://127.0.0.1:${server.port}/docs/studio-workspaces/index.html`,
);
