import "server-only";

import { getWorkspaceBookkeepingMetrics } from "@/lib/accounting-firm";
import {
  listWorkspaceBookkeepingReviewUploads,
  listWorkspaceClientBusinessReviewOptions,
} from "@/lib/bookkeeping-review";

export async function getWorkspaceReceiptReviewPageData(workspaceId: number) {
  const [uploads, metrics, clientBusinesses] = await Promise.all([
    listWorkspaceBookkeepingReviewUploads(workspaceId),
    getWorkspaceBookkeepingMetrics(workspaceId),
    listWorkspaceClientBusinessReviewOptions(workspaceId),
  ]);

  return {
    uploads,
    metrics,
    clientBusinesses,
  };
}

export async function getWorkspaceReceiptUploadPageData(workspaceId: number) {
  const { uploads, metrics, clientBusinesses } =
    await getWorkspaceReceiptReviewPageData(workspaceId);

  return {
    metrics,
    clientBusinesses,
    recentUploads: uploads.slice(0, 6).map((upload) => ({
      id: upload.id,
      fileName: upload.fileName,
      status: upload.status,
      documentType: upload.documentType,
      createdAt: upload.createdAt,
      clientBusinessName: upload.clientBusiness.name,
      duplicateOfUpload: upload.duplicateOfUpload,
    })),
  };
}
