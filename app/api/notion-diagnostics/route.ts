import { NextResponse } from "next/server";
import { collectNotionDiagnostics } from "@/lib/notionDiagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await collectNotionDiagnostics();
  return NextResponse.json(info);
}
