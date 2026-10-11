import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalRequest, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import {
  approveCase,
  classifyCase,
  confirmIdentity,
  discoverCase,
  editProposal,
  executeCase,
  getState,
  refreshFindings,
  verifyCase,
} from "@/lib/server/workflow";
export const runtime = "nodejs";

const inputSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("confirm"),
      subjectId: z.string(),
      attested: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("discover") }).strict(),
  z.object({ type: z.literal("classify") }).strict(),
  z
    .object({
      type: z.literal("edit"),
      findingId: z.string(),
      action: z.enum(["delete", "redact", "retain", "dismiss"]),
      reason: z.string().max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("approve"),
      reviewer: z.string().max(100),
      confirmed: z.boolean(),
      planVersion: z.number().int(),
    })
    .strict(),
  z
    .object({ type: z.literal("execute"), simulateFailure: z.boolean() })
    .strict(),
  z.object({ type: z.literal("verify") }).strict(),
  z.object({ type: z.literal("refresh") }).strict(),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertLocalRequest(request, true);
    const input = inputSchema.parse(await request.json());
    const { id } = await context.params;
    const store = getStore();
    switch (input.type) {
      case "confirm":
        confirmIdentity(store, id, input.subjectId, input.attested);
        break;
      case "discover":
        discoverCase(store, id);
        break;
      case "classify":
        await classifyCase(store, id);
        break;
      case "edit":
        editProposal(store, id, input.findingId, input.action, input.reason);
        break;
      case "approve":
        approveCase(
          store,
          id,
          input.reviewer,
          input.confirmed,
          input.planVersion,
        );
        break;
      case "execute":
        executeCase(store, id, input.simulateFailure);
        break;
      case "verify":
        verifyCase(store, id);
        break;
      case "refresh":
        refreshFindings(store, id);
        break;
    }
    return NextResponse.json(getState(store));
  } catch (error) {
    return errorResponse(error);
  }
}
