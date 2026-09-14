import { blocksClient } from "../../lib/blocks/client";
import type { BlocksRole, BlocksUser } from "@seliseblocks/client";
import type { VaultObject, VaultPermission, VaultPrincipalType, VaultResourceType } from "./types";

const CONFIGURATION_NAME = "Default";
const PAGE_LIMIT = 60;

export class VaultError extends Error {}

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

export async function listObjects(params: {
  cursor?: string;
  limit?: number;
  parentDirectoryId?: string;
  search?: string;
}) {
  return blocksClient.data.objects.list({ limit: PAGE_LIMIT, moduleName: 8, ...params });
}

export async function searchObjects(params: { cursor?: string; directoryId?: string; limit?: number; query: string }) {
  return blocksClient.data.objects.search({ limit: PAGE_LIMIT, ...params });
}

export async function listSharedWithMe(params: { cursor?: string; limit?: number }) {
  return blocksClient.data.objects.shared({ limit: PAGE_LIMIT, ...params });
}

export async function createFolder(params: { description?: string; name: string; parentDirectoryId?: string }): Promise<{ directoryId: string }> {
  const name = params.name.trim();
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new VaultError("Folder name can't be empty, \".\", \"..\", or contain a slash.");
  }
  const response = await blocksClient.data.directories.create({
    configurationName: CONFIGURATION_NAME,
    description: params.description,
    name,
    parentDirectoryId: params.parentDirectoryId
  });
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
  file: File;
  parentDirectoryId?: string;
}): Promise<{ fileId: string }> {
  const presign = await blocksClient.data.files.presignedUploadUrl({
    accessModifier: "Private",
    configurationName: CONFIGURATION_NAME,
    contentType: params.file.type || "application/octet-stream",
    name: params.file.name,
    parentDirectoryId: params.parentDirectoryId
  });
  assertSuccess(presign, "Could not start the upload.");
  const { uploadUrl, fileId } = presign as { fileId?: string; uploadUrl?: string };
  if (!uploadUrl || !fileId) throw new VaultError("Upload did not return a destination URL.");

  try {
    await blocksClient.data.files.uploadToUrl({
      body: params.file,
      contentType: params.file.type || "application/octet-stream",
      url: uploadUrl
    });
  } catch {
    // The file record + version metadata already exist at this point (the
    // presign call above created them) even though the byte PUT failed --
    // surface that distinction rather than a generic "upload failed".
    throw new VaultError(`"${params.file.name}" was registered but its content failed to upload. Delete it and try again.`);
  }

  return { fileId };
}

export async function getFileDownloadUrl(fileId: string): Promise<string> {
  const response = await blocksClient.data.files.get(fileId, { configurationName: CONFIGURATION_NAME });
  const url = extractDownloadUrl(response);
  if (!url) throw new VaultError("No download link was returned for this file.");
  return url;
}

export async function deleteObject(params: { permanent?: boolean; resourceId: string; resourceType: VaultResourceType }) {
  if (params.resourceType === "File") {
    return blocksClient.data.files.delete({ configurationName: CONFIGURATION_NAME, fileId: params.resourceId, permanent: params.permanent ?? false });
  }
  return blocksClient.data.directories.delete({ directoryId: params.resourceId, permanent: params.permanent ?? false });
}

export async function shareObject(params: {
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

export async function searchUsers(search: string): Promise<BlocksUser[]> {
  if (!search.trim()) return [];
  const response = await blocksClient.iam.users.list({ pageNo: 1, pageSize: 10, search: search.trim() });
  return response.data ?? [];
}

export async function listRoles(): Promise<BlocksRole[]> {
  const response = await blocksClient.iam.roles.list({ pageNo: 1, pageSize: 100 });
  return response.data ?? [];
}

export async function listMyOrganizations() {
  const response = await blocksClient.iam.organizations.my();
  return response.organizations ?? [];
}
