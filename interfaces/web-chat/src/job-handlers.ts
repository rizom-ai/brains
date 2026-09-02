import type { InterfacePluginContext } from "@brains/plugins";

type AuthSessionResolver = (request: Request) => Promise<boolean>;
type JobService = InterfacePluginContext["jobs"];

interface JobStatusHandlerDeps {
  resolveAuthSession: AuthSessionResolver;
  createAuthLoginRequiredResponse: (request: Request) => Response;
  jobs: JobService;
}

export async function handleJobStatusRequest(
  request: Request,
  deps: JobStatusHandlerDeps,
): Promise<Response> {
  if (!(await deps.resolveAuthSession(request))) {
    return deps.createAuthLoginRequiredResponse(request);
  }

  const jobId = new URL(request.url).searchParams.get("id")?.trim();
  if (!jobId) {
    return new Response("Missing job id", { status: 400 });
  }

  const job = await deps.jobs.getStatus(jobId);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  return Response.json({
    id: job.id,
    status: job.status,
    message: job.lastError ?? undefined,
  });
}
