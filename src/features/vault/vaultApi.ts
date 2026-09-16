import { blocksClient } from "../../lib/blocks/client";
import { blocksFiles, type VerificationStatus } from "../../lib/blocks/storage";
import type { BlocksRole, BlocksUser } from "@seliseblocks/client";
import type { VaultObject, VaultPermission, VaultPrincipalType, VaultResourceType } from "./types";

const CONFIGURATION_NAME = "Default";
const PAGE_LIMIT = 60;

export class VaultError extends Error {}

const REJECTION_MESSAGES: Record<string, string> = {
  actual_size_does_not_match_declared_size: "The uploaded file didn't match its expected size. Please try again.",
  actual_size_exceeds_maximum_allowed: "This file is larger than the maximum allowed size.",
  candidate_object_not_found: "The upload couldn't be verified due to a server-side issue. Please try again.",
  checksum_mismatch: "The uploaded file may be corrupted because its checksum did not match. Please try again.",
  quarantine_key_missing: "The upload couldn't be verified due to a server-side issue. Please try again.",
  quarantine_object_not_found: "The upload didn't finish reaching storage. Please try again.",
  real_file_type_does_not_match_extension: "The file's contents don't match its extension and were rejected for safety.",
  stored_content_type_does_not_match_declared_content_type: "The uploaded file's type didn't match what was declared. Please try again."
};

export type ObjectAccessLevel = "Creator" | "Organization";
export type StorageAccessModifier = "Private" | "Public";

export type VaultAccessPolicy = {
  effect?: "Allow" | "Deny";
  expiresAt?: string;
  organizationId?: string;
  permission: VaultPermission;
  policyItemId: string;
  principalId?: string;
  principalName?: string;
  principalType: VaultPrincipalType;
  priority?: number;
  resourceId?: string;
  resourceType?: VaultResourceType;
};

function assertSuccess(response: unknown, fallbackMessage: string): asserts response is Record<string, unknown> {
  if (!response || typeof response !== "object") throw new VaultError(fallbackMessage);
  const record = response as Record<string, unknown>;
  if (record.isSuccess === false) {
    const errors = record.errors;
    const message = typeof errors === "string" ? errors : errors ? JSON.stringify(errors) : fallbackMessage;
    throw new VaultError(message);
  }
}

// data.files.get()'s response is typed `unknown` by the SDK -- Data Storage
// doesn't publish one fixed field name for the download link across
// providers/versions, so read defensively instead of assuming a shape.
function extractDownloadUrl(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;
  const candidates = [record.downloadUrl, record.url, record.fileUrl, record.signedUrl, record.preSignedUrl, record.sasUrl];
  const direct = candidates.find((value): value is string => typeof value === "string" && value.length > 0);
  if (direct) return direct;
  if (record.data && typeof record.data === "object") return extractDownloadUrl(record.data);
  return undefined;
}

function readString(response: unknown, key: string): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;
  if (typeof record[key] === "string") return record[key] as string;
  return record.data && typeof record.data === "object" ? readString(record.data, key) : undefined;
}

function rejectionMessage(reason?: string | null): string {
  return reason && REJECTION_MESSAGES[reason]
    ? REJECTION_MESSAGES[reason]
    : "This upload was rejected during verification. Please try again.";
}

async function computeChecksum(file: File): Promise<{ checksum: string; checksumAlgorithm: "SHA256" } | undefined> {
  try {
    if (!crypto.subtle) return undefined;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return {
      checksum: Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
      checksumAlgorithm: "SHA256"
    };
  } catch {
    // Checksums strengthen verification but are optional. Browsers without a
    // secure crypto context can still use server-side size/type verification.
    return undefined;
  }
}

export async function listObjects(params: {
  cursor?: string;
  limit?: number;
  parentDirectoryId?: string;
  search?: string;
}) {
  return blocksClient.data.objects.list({ limit: PAGE_LIMIT, ...params });
}

export async function searchObjects(params: { cursor?: string; directoryId?: string; limit?: number; query: string }) {
  return blocksClient.data.objects.search({ limit: PAGE_LIMIT, ...params });
}

export async function listSharedWithMe(params: { cursor?: string; limit?: number }) {
  return blocksClient.data.objects.shared({ limit: PAGE_LIMIT, ...params });
}

export async function listTrash(params: { cursor?: string; limit?: number }) {
  return blocksClient.data.objects.trash({ limit: PAGE_LIMIT, ...params });
}

export async function createFolder(params: {
  description?: string;
  name: string;
  objectAccessLevel?: ObjectAccessLevel;
  parentDirectoryId?: string;
}): Promise<{ directoryId: string }> {
  const name = params.name.trim();
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new VaultError("Folder name can't be empty, \".\", \"..\", or contain a slash.");
  }
  const request = {
    configurationName: CONFIGURATION_NAME,
    description: params.description,
    name,
    objectAccessLevel: params.objectAccessLevel ?? "Creator",
    parentDirectoryId: params.parentDirectoryId
  };
  const response = await blocksClient.data.directories.create(request);
  assertSuccess(response, "Could not create the folder.");
  const { directoryId } = response as { directoryId?: string };
  if (!directoryId) throw new VaultError("Folder was created but no id was returned.");
  return { directoryId };
}

// "My Drive" is anchored on a shared root ("Cloud") that every project user
// has Edit on, so browsing/creating there works for everyone -- but a new
// item under it inherits that same broad grant by default, which would make
// every user's top-level folders and files visible to the whole project.
// Call this right after creating a top-level item to keep it private again:
// explicit ownership first (the API rejects disabling inheritance on a
// resource with no direct grant of its own, to avoid orphaning it), then
// cut it loose from Cloud's inherited access.
export async function makePrivate(params: { ownerId: string; resourceId: string; resourceType: VaultResourceType }): Promise<void> {
  const grant = await blocksClient.data.objects.grantAccess({
    effect: "Allow",
    permission: "Owner",
    principalId: params.ownerId,
    principalType: "User",
    resourceId: params.resourceId,
    resourceType: params.resourceType
  });
  assertSuccess(grant, "Could not secure ownership of this item.");

  const toggled = await blocksClient.data.objects.toggleInheritance({
    inheritsParentAccess: false,
    resourceId: params.resourceId
  });
  assertSuccess(toggled, "Could not make this item private.");
}

export async function uploadFile(params: {
  accessModifier?: StorageAccessModifier;
  file: File;
  objectAccessLevel?: ObjectAccessLevel;
  parentDirectoryId?: string;
}): Promise<{ fileId: string }> {
  const contentType = params.file.type || "application/octet-stream";
  const checksum = await computeChecksum(params.file);
  const presign = await blocksFiles.presignedUploadUrl({
    accessModifier: params.accessModifier ?? "Private",
    additionalProperties: {
      lastModified: new Date(params.file.lastModified).toISOString(),
      mimeType: params.file.type || "application/octet-stream",
      originalName: params.file.name
    },
    checksum: checksum?.checksum,
    checksumAlgorithm: checksum?.checksumAlgorithm,
    configurationName: CONFIGURATION_NAME,
    // The 0.2.0 SDK's upload normalizer currently drops lower-camel
    // `contentType`; keep the wire field explicitly until the typed client
    // includes the completion contract.
    ContentType: contentType,
    name: params.file.name,
    objectAccessLevel: params.objectAccessLevel ?? "Creator",
    parentDirectoryId: params.parentDirectoryId,
    sizeInBytes: params.file.size
  });
  assertSuccess(presign, "Could not start the upload.");
  const {
    fileId,
    fileVersionId,
    requiredHeaders,
    uploadCompletionRequired,
    uploadUrl
  } = presign as {
    fileId?: string;
    fileVersionId?: string;
    requiredHeaders?: Record<string, string>;
    uploadCompletionRequired?: boolean;
    uploadUrl?: string;
    verificationStatus?: VerificationStatus;
  };
  if (!uploadUrl || !fileId) throw new VaultError("Upload did not return a destination URL.");

  try {
    await blocksFiles.uploadToUrl({
      body: params.file,
      contentType,
      headers: requiredHeaders,
      url: uploadUrl
    });
  } catch {
    // The file record + version metadata already exist at this point (the
    // presign call above created them) even though the byte PUT failed --
    // surface that distinction rather than a generic "upload failed".
    throw new VaultError(`"${params.file.name}" was registered but its content failed to upload. Delete it and try again.`);
  }

  if (uploadCompletionRequired) {
    if (!fileVersionId) {
      throw new VaultError(`"${params.file.name}" uploaded, but completion was required and no file version id was returned.`);
    }
    const completion = await blocksFiles.completeUpload({ fileId, fileVersionId });
    assertSuccess(completion, `Could not complete "${params.file.name}".`);
    if (completion.verificationStatus === "Rejected") {
      throw new VaultError(rejectionMessage(completion.rejectionReason));
    }
  }

  return { fileId };
}

export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const response = await blocksClient.data.files.get(fileId, { configurationName: CONFIGURATION_NAME });
  const url = extractDownloadUrl(response);
  if (!url) {
    const status = readString(response, "verificationStatus");
    if (status === "Quarantined") throw new VaultError("This file is still being verified and isn't available yet.");
    if (status === "Rejected") throw new VaultError("This file failed verification and can't be downloaded.");
    throw new VaultError("No download link was returned for this file.");
  }
  return url;
}

export async function getFileVersionDownloadUrl(fileId: string, version: number): Promise<string> {
  const response = await blocksClient.data.files.get(fileId, {
    configurationName: CONFIGURATION_NAME,
    version
  });
  const url = extractDownloadUrl(response);
  if (!url) throw new VaultError(`No download link was returned for version ${version}.`);
  return url;
}

export type VaultFileVersion = {
  createdDate?: string;
  itemId: string;
  no: number;
  sizeInBytes?: number;
  uploadedBy?: string;
};

export type VaultFileVersionsPage = {
  hasMore: boolean;
  items: VaultFileVersion[];
  nextCursor?: string;
};

export async function listFileVersions(params: { cursor?: string; fileId: string; limit?: number }): Promise<VaultFileVersionsPage> {
  const response = await blocksClient.data.files.versions({ limit: 25, ...params });
  assertSuccess(response, "Could not load version history.");
  const record = response as Record<string, unknown>;
  const rawItems = Array.isArray(record.items)
    ? record.items
    : record.data && typeof record.data === "object" && Array.isArray((record.data as Record<string, unknown>).items)
      ? (record.data as Record<string, unknown>).items as unknown[]
      : [];
  const items = rawItems.flatMap((raw): VaultFileVersion[] => {
    if (!raw || typeof raw !== "object") return [];
    const version = raw as Record<string, unknown>;
    const no = Number(version.no ?? version.versionNo ?? version.version);
    if (!Number.isFinite(no)) return [];
    return [{
      createdDate: typeof version.createdDate === "string" ? version.createdDate : undefined,
      itemId: String(version.itemId ?? version.fileVersionId ?? `${params.fileId}-${no}`),
      no,
      sizeInBytes: typeof version.sizeInBytes === "number" ? version.sizeInBytes : undefined,
      uploadedBy: typeof version.uploadedBy === "string" ? version.uploadedBy : undefined
    }];
  });
  return {
    hasMore: record.hasMore === true,
    items,
    nextCursor: typeof record.nextCursor === "string" ? record.nextCursor : undefined
  };
}

export async function renameObject(params: { object: VaultObject; name: string }): Promise<void> {
  const name = params.name.trim();
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new VaultError("Name can't be empty, \".\", \"..\", or contain a slash.");
  }
  const response = params.object.type === "directory"
    ? await blocksClient.data.directories.update({ directoryId: params.object.itemId, name })
    : await blocksClient.data.files.rename({ fileId: params.object.itemId, name });
  assertSuccess(response, `Could not rename "${params.object.name}".`);
}

export async function moveObject(params: { object: VaultObject; targetDirectoryId: string }): Promise<void> {
  const response = params.object.type === "directory"
    ? await blocksClient.data.directories.move({ directoryId: params.object.itemId, targetDirectoryId: params.targetDirectoryId })
    : await blocksClient.data.files.move({ fileId: params.object.itemId, targetDirectoryId: params.targetDirectoryId });
  assertSuccess(response, `Could not move "${params.object.name}".`);
}

export async function copyFile(params: { fileId: string; targetDirectoryId: string }): Promise<void> {
  const response = await blocksClient.data.files.copy({
    copyAccessPolicies: false,
    fileId: params.fileId,
    targetDirectoryId: params.targetDirectoryId
  });
  assertSuccess(response, "Could not copy the file.");
}

export async function deleteObject(params: { permanent?: boolean; resourceId: string; resourceType: VaultResourceType }) {
  if (params.resourceType === "File") {
    return blocksClient.data.files.delete({ configurationName: CONFIGURATION_NAME, fileId: params.resourceId, permanent: params.permanent ?? false });
  }
  return blocksClient.data.directories.delete({ directoryId: params.resourceId, permanent: params.permanent ?? false });
}

export async function restoreObject(resourceId: string): Promise<void> {
  const response = await blocksClient.data.objects.restore({ resourceId });
  assertSuccess(response, "Could not restore this item.");
}

export async function purgeObject(resourceId: string): Promise<void> {
  const response = await blocksClient.data.objects.deleteFromTrash({ resourceId });
  assertSuccess(response, "Could not permanently delete this item.");
}

export async function shareObject(params: {
  organizationId?: string;
  permission: VaultPermission;
  principalId?: string;
  principalType: VaultPrincipalType;
  resourceId: string;
  resourceType: VaultResourceType;
}) {
  const response = await blocksClient.data.objects.share(params);
  assertSuccess(response, "Could not share this item.");
  return response;
}

function accessPolicyList(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.policies)) return record.policies;
  if (record.data && typeof record.data === "object") return accessPolicyList(record.data);
  return [];
}

export async function listAccessPolicies(resourceId: string): Promise<VaultAccessPolicy[]> {
  const response = await blocksClient.data.objects.accessPolicies(resourceId);
  assertSuccess(response, "Could not load existing access.");
  return accessPolicyList(response).flatMap((entry): VaultAccessPolicy[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const policyItemId = String(row.policyItemId ?? row.itemId ?? row.id ?? "");
    if (!policyItemId) return [];
    return [{
      effect: row.effect === "Deny" ? "Deny" : "Allow",
      expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : undefined,
      organizationId: typeof row.organizationId === "string" ? row.organizationId : undefined,
      permission: (row.permission ?? "View") as VaultPermission,
      policyItemId,
      principalId: typeof row.principalId === "string" ? row.principalId : undefined,
      principalName: typeof row.principalName === "string" ? row.principalName : undefined,
      principalType: (row.principalType ?? "User") as VaultPrincipalType,
      priority: typeof row.priority === "number" ? row.priority : undefined,
      resourceId: typeof row.resourceId === "string" ? row.resourceId : resourceId,
      resourceType: row.resourceType as VaultResourceType | undefined
    }];
  });
}

export async function updateAccessPolicy(policy: VaultAccessPolicy, permission: VaultPermission, resourceType: VaultResourceType): Promise<void> {
  const request = {
    effect: policy.effect ?? "Allow",
    organizationId: policy.organizationId,
    permission,
    policyItemId: policy.policyItemId,
    principalId: policy.principalId,
    principalType: policy.principalType,
    priority: policy.priority ?? 0,
    resourceId: policy.resourceId!,
    resourceType
  };
  const response = await blocksClient.data.objects.updateAccess(request);
  assertSuccess(response, "Could not update access.");
}

export async function revokeAccessPolicy(resourceId: string, policyItemId: string): Promise<void> {
  const response = await blocksClient.data.objects.revokeAccess({ policyItemId, resourceId });
  assertSuccess(response, "Could not remove access.");
}

export async function describeAccessPrincipal(policy: VaultAccessPolicy): Promise<{ primary: string; secondary: string }> {
  if (policy.principalType === "Everyone") return { primary: policy.principalName || "Everyone", secondary: "Everyone" };
  if (!policy.principalId) return { primary: policy.principalName || "Unknown principal", secondary: policy.principalType };

  if (policy.principalType === "User") {
    const response = await blocksClient.iam.users.get(policy.principalId, { organizationId: policy.organizationId });
    const user = response.data;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return { primary: name || user?.email || policy.principalName || policy.principalId, secondary: user?.email || "User" };
  }

  if (policy.principalType === "Role") {
    const [roleResponse, organizationResponse] = await Promise.all([
      blocksClient.iam.roles.get(policy.principalId),
      policy.organizationId ? blocksClient.iam.organizations.get(policy.organizationId) : Promise.resolve(undefined)
    ]);
    return {
      primary: roleResponse.data?.name || policy.principalName || policy.principalId,
      secondary: organizationResponse?.data?.name ? `Role in ${organizationResponse.data.name}` : "Role"
    };
  }

  const response = await blocksClient.iam.organizations.get(policy.principalId);
  return { primary: response.data?.name || policy.principalName || policy.principalId, secondary: "Organization" };
}

export async function searchUsers(search: string): Promise<BlocksUser[]> {
  if (!search.trim()) return [];
  const response = await blocksClient.iam.users.list({ pageNo: 1, pageSize: 10, search: search.trim() });
  return response.data ?? [];
}

export async function searchRoles(search: string): Promise<BlocksRole[]> {
  if (!search.trim()) return [];
  const response = await blocksClient.iam.roles.list({ pageNo: 1, pageSize: 10, search: search.trim() });
  return response.data ?? [];
}

export async function listMyOrganizations() {
  const response = await blocksClient.iam.organizations.my();
  return response.organizations ?? [];
}
