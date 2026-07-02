import { NextRequest, NextResponse } from "next/server";
import { collectNotionDiagnostics } from "@/lib/notionDiagnostics";
import { resolveTokenFromRequest } from "@/lib/notionAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { token, authMode, meta } = resolveTokenFromRequest(request);
  const connectedUser =
    authMode === "oauth" && meta
      ? {
          name: meta.ownerName ?? null,
          workspaceName: meta.workspaceName ?? null,
          connectedAt: meta.connectedAt ?? null,
        }
      : null;
  const info = await collectNotionDiagnostics(token, authMode, connectedUser);
  return NextResponse.json(info);
}
