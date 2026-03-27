import { NextResponse } from "next/server";
import { getAuthContext, requireRoleAtLeast } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const auth = await requireRoleAtLeast(ctx.workspaceId, "VIEWER");
  if (!auth.ok) {
    return new NextResponse(auth.error, { status: auth.status });
  }

  const params = await context.params;
  const uploadId = Number(params.id);
  if (!Number.isInteger(uploadId)) {
    return new NextResponse("Invalid upload id", { status: 400 });
  }

  const upload = await prisma.bookkeepingUpload.findFirst({
    where: {
      id: uploadId,
      workspaceId: ctx.workspaceId,
    },
    select: {
      fileName: true,
      fileType: true,
      fileData: true,
    },
  });

  if (!upload?.fileData) {
    return new NextResponse("File not found", { status: 404 });
  }

  return new NextResponse(upload.fileData, {
    status: 200,
    headers: {
      "Content-Type": upload.fileType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${upload.fileName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
