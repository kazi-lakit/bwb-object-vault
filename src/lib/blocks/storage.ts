import { blocksClient } from "./client";

export type VerificationStatus = "Unverified" | "Quarantined" | "Verified" | "Rejected";

export type CompleteUploadResponse = {
  errors?: unknown;
  fileId?: string;
  fileVersionId?: string;
  isSuccess?: boolean;
  rejectionReason?: string | null;
  verificationStatus?: VerificationStatus;
};

// @seliseblocks/client 0.2.0 does not yet expose complete-upload under
// data.files. Extend that SDK surface through its public authenticated HTTP
// transport, preserving the SDK's x-blocks-key, session, 401 retry, and error
// handling instead of introducing a separate fetch wrapper in the app.
export const blocksFiles = {
  ...blocksClient.data.files,
  completeUpload: (request: { fileId: string; fileVersionId: string }) =>
    blocksClient.http.request<CompleteUploadResponse>("/data/v4/files/complete-upload", {
      body: request
    })
};
