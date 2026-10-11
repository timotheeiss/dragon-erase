import { NextResponse } from "next/server";
import { assertLocalRequest, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { exportReport, WorkflowError } from "@/lib/server/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertLocalRequest(request);
    const c = getStore().getCase((await context.params).id);
    if (!c) throw new WorkflowError("Case not found.", 404);
    return NextResponse.json(exportReport(c), {
      headers: {
        "Content-Disposition": `attachment; filename="${c.reference}-audit.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
