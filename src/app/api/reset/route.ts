import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalRequest, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { getState } from "@/lib/server/workflow";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertLocalRequest(request, true);
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(await request.json());
    const store = getStore();
    store.reset();
    return NextResponse.json(getState(store));
  } catch (error) {
    return errorResponse(error);
  }
}
