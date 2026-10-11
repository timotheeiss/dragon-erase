import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { WorkflowError } from "./workflow";

/** Local-only demo: reject cross-origin writes and cross-site browser reads. */
export function assertLocalRequest(request: Request, write = false) {
  const url = new URL(request.url);
  // Next can normalize the internal URL to a different loopback host. The
  // validated Host header represents the actual origin used by the browser.
  const publicUrl = new URL(
    `${url.protocol}//${request.headers.get("host") || url.host}`,
  );
  if (!["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname))
    throw new WorkflowError("This demo is available on localhost only.", 403);
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (site === "cross-site" || (origin && origin !== publicUrl.origin))
    throw new WorkflowError("Cross-origin requests are not allowed.", 403);
  if (
    write &&
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new WorkflowError("Expected application/json.", 415);
}

export function errorResponse(error: unknown) {
  if (error instanceof WorkflowError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError || error instanceof SyntaxError)
    return NextResponse.json(
      { error: "The request contains invalid or missing fields." },
      { status: 400 },
    );
  if (error instanceof Error && error.message.startsWith("This case changed"))
    return NextResponse.json({ error: error.message }, { status: 409 });
  console.error(
    "Workflow failure",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    { error: "The operation failed. Refresh and try again." },
    { status: 500 },
  );
}
