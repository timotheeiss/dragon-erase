import { NextResponse } from "next/server";
import { assertLocalRequest, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { getState } from "@/lib/server/workflow";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    assertLocalRequest(request);
    return NextResponse.json(getState(getStore()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
