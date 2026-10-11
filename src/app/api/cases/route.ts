import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalRequest, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { createCase, getState } from "@/lib/server/workflow";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertLocalRequest(request, true);
    const input = z
      .object({ query: z.string().min(2).max(200) })
      .strict()
      .parse(await request.json());
    const store = getStore();
    createCase(store, input.query);
    return NextResponse.json(getState(store));
  } catch (error) {
    return errorResponse(error);
  }
}
