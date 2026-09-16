# Blocks Storage: Secure Upload, Access, and Sharing Implementation Guide

This document is the implementation contract for adding Blocks Storage to a new application or safely upgrading an application that already uses Blocks Storage.

It is intentionally written so that a software engineer or an AI coding agent can implement the feature without inferring security-sensitive behavior.

The guide covers:

- cloud upload, including the upload-completion and verification flow;
- `AccessModifier` and `ObjectAccessLevel`;
- directory access scope;
- file-version uploads;
- download behavior for quarantined or rejected content;
- direct access policies and sharing;
- exact `principalId` rules for users, roles, organizations, and organization-scoped roles;
- migration requirements for partially implemented applications;
- failure handling, security rules, and acceptance tests.

> [!IMPORTANT]
> Use the official `@seliseblocks/client` SDK for every Blocks API request. Do not reproduce Blocks authentication with raw `fetch`, Axios, cURL, or hand-built headers. The only request sent to a non-Blocks URL is the binary upload to the provider-signed URL, and that request must not contain Blocks credentials.

---

## 1. Audience and implementation modes

Use this guide in one of two modes.

### Mode A: New application

Implement the complete contract in this document. Use the secure defaults:

- `accessModifier: "Private"`
- `objectAccessLevel: "Creator"`
- conditional upload completion based on the presign response
- no download while a file version is quarantined or rejected
- sharing through access-policy APIs, not by changing file ownership

### Mode B: Existing or partially implemented application

Audit the existing implementation against the migration checklist before editing it. Preserve working authentication, tenancy, routing, and unrelated storage behavior. Add only the missing parts.

The most important migration decision is `ObjectAccessLevel`:

- A new application should default to `Creator`.
- An older application may have omitted the property. Omission can preserve legacy allow-all behavior, depending on the backend configuration/version.
- Do not silently replace an omitted value with `Creator` in a production application. That may remove access that users currently depend on.
- Do not keep omission merely for convenience. It may be broader than the product intends.
- Record the decision, obtain product/security approval when existing access could change, and test with real tenant roles before release.

---

## 2. Non-negotiable rules

An implementation is incomplete if any of these rules are violated.

1. Use one configured `@seliseblocks/client` instance for Blocks requests.
2. Never send a Blocks access token, `x-blocks-key`, cookies, or application credentials to a presigned provider URL.
3. Treat `requiredHeaders` returned by the presign operation as authoritative.
4. Call upload completion only when `uploadCompletionRequired` is `true`.
5. When completion is required, do not report success until completion returns `Verified`.
6. Treat `Quarantined` as unavailable and `Rejected` as failed.
7. Never construct storage object keys or provider URLs in the browser.
8. Use `role.slug` as `principalId` when sharing with a role. Do not use the role record ID.
9. Use the user ID as `principalId` when sharing with a user.
10. List current direct access policies whenever the share/access dialog opens, and refresh the list after grant, update, or revoke.
11. Do not allow the owner policy to be removed through the normal sharing UI.
12. For soft deletion, explicitly send `permanent: false`; do not rely on a backend default.
13. The backend remains authoritative. UI permission flags improve usability but are not a substitute for server authorization.

---

## 3. Terminology

| Term | Meaning |
| --- | --- |
| Blocks API | The authenticated Data/Storage API accessed through `@seliseblocks/client`. |
| Provider URL | A time-limited signed URL for object storage, such as S3-compatible storage. |
| Presign | The Blocks operation that creates file metadata/version information and returns a provider upload URL. |
| Upload completion | The Blocks operation that verifies and promotes an uploaded file version when the storage configuration requires it. |
| Access modifier | Whether stored bytes are private or publicly addressable. |
| Object access level | The default application-level audience for a file or directory. |
| Direct policy | An access policy attached directly to the selected file or directory. |
| Inherited policy | Access inherited from a parent directory. It may affect resolved access without appearing in the direct-policy list. |
| Principal | The user, role, organization, organization-scoped role, or everyone target receiving access. |

---

## 4. `AccessModifier` and `ObjectAccessLevel` are different controls

Do not merge these concepts in code or UI.

### 4.1 `AccessModifier`

`AccessModifier` controls storage-level visibility of file bytes.

| Value | Upload behavior | Guidance |
| --- | --- | --- |
| `Private` | Access to bytes requires an authorized, time-limited download URL. | Safe default. Use for business documents and personal files. |
| `Public` | The stored object may be accessible without an authenticated Blocks download flow. | Use only when anonymous public access is an explicit product requirement. |

Some generated SDK types may expose additional enum members such as `Secure` or `Any`. Do not use them for upload unless the active backend contract explicitly supports them. For the upload flows described here, send `Private` or `Public`.

### 4.2 `ObjectAccessLevel`

`ObjectAccessLevel` controls the default application-level audience.

| Value | Intended default audience | Guidance |
| --- | --- | --- |
| `Creator` | The creator, plus principals explicitly granted access. | Safe default for new applications. |
| `Organization` | Members of the creator's organization, subject to backend authorization and direct policies. | Use when organization-wide collaboration is intended. |
| omitted / `null` | Legacy behavior; may be broadly accessible depending on backend compatibility behavior. | Use only as an explicit migration decision. |

### 4.3 Examples

- `Private` + `Creator`: bytes are private and the object begins as creator-scoped.
- `Private` + `Organization`: bytes are private, while organization members may be authorized to obtain a download URL.
- `Public` + `Creator`: the metadata/UI audience is creator-scoped, but anyone who obtains the public byte URL may be able to read it. This combination does not make the bytes confidential.
- Sharing a private file with `Everyone` is an access-policy decision; it is not automatically identical to changing the file's storage modifier to `Public`.

> [!WARNING]
> Never describe `Public` as merely “visible in the application.” It can change the confidentiality of the stored bytes.

---

## 5. Recommended architecture

Keep transport logic separate from UI state.

```text
Configured Blocks client
        |
        +-- storage adapter
        |     +-- presign upload
        |     +-- upload bytes to signed URL
        |     +-- complete upload
        |     +-- request download URL
        |     +-- create/list/move/trash objects
        |
        +-- access-policy adapter
              +-- list direct policies
              +-- grant/update/revoke
              +-- resolve effective access
              +-- toggle inheritance

Feature layer
        +-- upload modal and progress
        +-- file/folder views
        +-- access manager/share dialog
        +-- permission-aware actions
```

Recommended rules:

- Configure the SDK once and import the shared client everywhere.
- Put any temporary SDK compatibility extension beside that client.
- Keep upload orchestration in one function so every upload surface uses the same completion and verification behavior.
- Keep access-policy payload construction in one place so principal identifiers cannot vary between screens.
- Do not copy upload logic into drag-and-drop, modal, and editor components independently.

---

## 6. Cloud upload contract

For cloud/object-storage configurations, upload is a two- or three-stage flow:

```text
1. Presign through Blocks
          |
          v
2. PUT raw bytes to provider URL
          |
          v
3. Complete through Blocks, only when required
```

The application must follow the response from the presign operation. It must not decide locally that completion is always or never required.

### 6.1 Stage 1: request a presigned upload URL

Use the SDK file presign method, normally exposed under `client.data.files`.

Logical request payload:

```jsonc
{
  // Empty or omitted for a new file. Set to an existing file ID for a new version.
  "itemId": "",
  "name": "invoice.pdf",
  "parentDirectoryId": "directory-id-or-empty-root-value",
  "tags": "",
  "accessModifier": "Private",
  "objectAccessLevel": "Creator",
  "configurationName": "Default",
  "moduleName": 0,
  "metaData": "",
  "additionalProperties": {
    "mimeType": "application/pdf",
    "originalName": "invoice.pdf",
    "lastModified": 1770000000000
  },
  "sizeInBytes": 48213,
  "contentType": "application/pdf",
  "checksum": "lowercase-sha256-hex-when-available",
  "checksumAlgorithm": "SHA256"
}
```

Requirements:

- `name`: use the actual user-visible file name.
- `parentDirectoryId`: use the current directory ID, or the backend-defined root representation.
- `configurationName`: use the configured storage name; do not invent one.
- `sizeInBytes`: use the exact byte length before upload.
- `contentType`: use the MIME type sent in the provider PUT. If the browser supplies an empty value, use `application/octet-stream`.
- `checksum`: compute SHA-256 when the runtime supports it and the file size is reasonable for client-side hashing.
- `checksumAlgorithm`: send `SHA256` when sending the SHA-256 checksum.
- `accessModifier`: default to `Private` for new applications.
- `objectAccessLevel`: default to `Creator` for new applications; follow the explicit migration decision for existing applications.
- `itemId`: send the existing file ID to create a new version of that file.

Do not hardcode a maximum file size from another application. File-size limits, allowed extensions, completion requirements, and URL lifetimes are storage-configuration concerns.

Typical presign response fields:

```jsonc
{
  "isSuccess": true,
  "uploadUrl": "https://provider.example/signed-upload-url",
  "fileId": "file-id",
  "fileVersionId": "file-version-id",
  "uploadSessionId": "upload-session-id",
  "uploadUrlExpiresAtUtc": "2026-09-17T12:00:00Z",
  "requiredHeaders": {
    "Content-Type": "application/pdf"
  },
  "uploadCompletionRequired": true,
  "verificationStatus": "Unverified"
}
```

Validate the response before stage 2:

- fail if `isSuccess === false`;
- require a non-empty `uploadUrl`;
- require a non-empty `fileId`;
- require `fileVersionId` when `uploadCompletionRequired === true`;
- keep `requiredHeaders` exactly as returned;
- keep `fileId` and `fileVersionId` together for completion and recovery.

### 6.2 Stage 2: upload bytes to the provider URL

Use the SDK's provider-upload helper when available, for example `data.files.uploadToUrl(...)`.

```ts
await client.data.files.uploadToUrl({
  url: presign.uploadUrl,
  body: file,
  contentType: file.type || "application/octet-stream",
  headers: presign.requiredHeaders ?? {},
});
```

Provider-upload requirements:

- send the exact raw `File`/`Blob` bytes;
- use `PUT` when required by the signed URL contract;
- merge and preserve every `requiredHeaders` entry;
- ensure `Content-Type` matches the value declared during presign;
- do not send Blocks authentication headers;
- do not send browser credentials/cookies;
- do not transform, base64-encode, or wrap the body in JSON or multipart data;
- treat any non-success provider response as a failed upload;
- account for signed URL expiry and clock-sensitive retries.

The storage provider's CORS configuration must allow:

- the application's exact origin;
- the required upload method, normally `PUT`;
- every header present in `requiredHeaders`;
- the declared `Content-Type` header.

If presign succeeds but provider upload fails, file metadata/version data may already exist. Show a recoverable failed state. Do not pretend that no record was created. Depending on product behavior, offer a fresh upload attempt or an authorized cleanup action.

### 6.3 Stage 3: complete the upload when required

After the provider PUT succeeds:

```ts
if (presign.uploadCompletionRequired) {
  const completion = await files.completeUpload({
    fileId: presign.fileId,
    fileVersionId: presign.fileVersionId,
  });

  if (completion.isSuccess === false) {
    throw new Error("Blocks rejected the upload completion request.");
  }

  if (completion.verificationStatus === "Rejected") {
    throw new Error(
      friendlyRejectionMessage(completion.rejectionReason),
    );
  }

  if (completion.verificationStatus !== "Verified") {
    throw new Error("Upload verification did not reach a final verified state.");
  }
}
```

Exact completion payload:

```json
{
  "fileId": "file-id-from-presign",
  "fileVersionId": "file-version-id-from-presign"
}
```

Typical completion response:

```jsonc
{
  "isSuccess": true,
  "fileId": "file-id",
  "fileVersionId": "file-version-id",
  "verificationStatus": "Verified",
  "rejectionReason": null,
  "errors": null
}
```

Rules:

- If `uploadCompletionRequired` is `false`, stage 2 completes the upload. Do not call completion.
- If it is `true`, do not show a success toast, close the progress flow, or refresh as successful until completion finishes.
- A required completion request should finish as `Verified` or `Rejected`. Treat a missing or unexpected status as an incomplete/invalid response rather than guessing that the upload succeeded.
- Completion is safe to retry with the same `fileId` and `fileVersionId` when the result is uncertain because of a timeout or lost response.
- Do not create a second presign request merely because the completion response was lost. Retry completion first.
- If the version is rejected, do not reuse it. Start a fresh presign/upload flow.

### 6.4 Verification states

Support these states even if the current UI normally sees only some of them:

| Status | Meaning | UI behavior |
| --- | --- | --- |
| `Unverified` | No completion-verification step applies; this is compatible with the earlier direct-to-final-key flow. | After a successful provider PUT, treat the upload as complete and rely on ordinary authorization/read behavior. |
| `Quarantined` | The version is isolated while verification/promotion is incomplete. | Show “still being verified” and disable download/open. |
| `Verified` | The version passed validation and is available. | Mark upload complete and refresh the object list. |
| `Rejected` | Verification failed. | Show a specific failure message and require a new upload. |

Known rejection reasons should be translated into user-facing messages while preserving the original code in diagnostics:

| Rejection code | User-facing meaning |
| --- | --- |
| `quarantine_key_missing` | The upload session was incomplete. Upload the file again. |
| `quarantine_object_not_found` | The uploaded bytes could not be found. Upload the file again. |
| `candidate_object_not_found` | The uploaded version could not be promoted. Upload the file again. |
| `actual_size_does_not_match_declared_size` | The uploaded size did not match the selected file. |
| `actual_size_exceeds_maximum_allowed` | The file exceeds the configured size limit. |
| `stored_content_type_does_not_match_declared_content_type` | The uploaded content type did not match the declared type. |
| `real_file_type_does_not_match_extension` | The file contents did not match its extension. |
| `checksum_mismatch` | Integrity verification failed. Select the source file and retry. |

For an unknown rejection code, display a safe generic message and log/telemetry the exact code without exposing secrets.

### 6.5 A complete upload orchestrator

The following is a reference shape, not a substitute for inspecting the installed SDK's generated types.

```ts
type UploadOptions = {
  parentDirectoryId?: string;
  configurationName: string;
  accessModifier?: "Private" | "Public";
  objectAccessLevel?: "Creator" | "Organization";
  existingFileId?: string;
};

async function uploadFile(file: File, options: UploadOptions) {
  const contentType = file.type || "application/octet-stream";
  const checksum = await sha256WhenSupported(file);

  const presign = await files.presignedUploadUrl({
    itemId: options.existingFileId ?? "",
    name: file.name,
    parentDirectoryId: options.parentDirectoryId ?? "",
    accessModifier: options.accessModifier ?? "Private",
    objectAccessLevel: options.objectAccessLevel ?? "Creator",
    configurationName: options.configurationName,
    additionalProperties: {
      mimeType: contentType,
      originalName: file.name,
      lastModified: file.lastModified,
    },
    sizeInBytes: file.size,
    contentType,
    ...(checksum
      ? { checksum, checksumAlgorithm: "SHA256" as const }
      : {}),
  });

  if (presign.isSuccess === false || !presign.uploadUrl || !presign.fileId) {
    throw new Error("Blocks did not return a valid upload session.");
  }

  await files.uploadToUrl({
    url: presign.uploadUrl,
    body: file,
    contentType,
    headers: presign.requiredHeaders ?? {},
  });

  if (!presign.uploadCompletionRequired) {
    return {
      fileId: presign.fileId,
      verificationStatus: presign.verificationStatus,
    };
  }

  if (!presign.fileVersionId) {
    throw new Error("The upload session requires completion but has no version ID.");
  }

  const completion = await files.completeUpload({
    fileId: presign.fileId,
    fileVersionId: presign.fileVersionId,
  });

  if (
    completion.isSuccess === false ||
    completion.verificationStatus === "Rejected"
  ) {
    throw new Error(friendlyRejectionMessage(completion.rejectionReason));
  }

  if (completion.verificationStatus !== "Verified") {
    throw new Error("Upload verification did not reach a final verified state.");
  }

  return {
    fileId: completion.fileId ?? presign.fileId,
    fileVersionId: completion.fileVersionId ?? presign.fileVersionId,
    verificationStatus: completion.verificationStatus,
  };
}
```

Do not blindly copy field names if the installed SDK uses generated enum values or a different typed request wrapper. Preserve the semantic payload above and verify the actual outgoing JSON in development tools or an integration test.

---

## 7. SDK compatibility and the completion endpoint

First inspect the installed `@seliseblocks/client` version and its generated `data.files` methods.

### Preferred implementation

If the SDK exposes a native completion method, use it:

```ts
await client.data.files.completeUpload({ fileId, fileVersionId });
```

### Narrow compatibility extension

If the installed SDK does not expose completion, add one typed adapter using the SDK's public authenticated HTTP transport. Keep the extension beside the configured client and remove it after upgrading to an SDK with native support.

```ts
export type VerificationStatus =
  | "Unverified"
  | "Quarantined"
  | "Verified"
  | "Rejected";

export type CompleteUploadResponse = {
  isSuccess?: boolean;
  fileId?: string;
  fileVersionId?: string;
  verificationStatus?: VerificationStatus;
  rejectionReason?: string | null;
  errors?: unknown;
};

export const files = {
  ...client.data.files,
  completeUpload: (request: {
    fileId: string;
    fileVersionId: string;
  }) =>
    client.http.request<CompleteUploadResponse>(
      "/data/v4/files/complete-upload",
      { body: request },
    ),
};
```

This exception does not authorize a separate raw HTTP client. Authentication, tenant context, correlation headers, refresh behavior, and base URL selection must continue to come from the configured Blocks SDK client.

### `@seliseblocks/client` 0.2.0 content-type note

Version `0.2.0` has been observed to omit lower-camel `contentType` from the normalized presign request in some integrations. Preferred resolution: upgrade to a fixed SDK version.

If upgrade is not currently possible, verify the outgoing payload and use the SDK-compatible explicit wire field expected by that version, for example `ContentType`, only in a narrowly typed adapter. Document and test the workaround. Do not add both casings without verifying backend behavior.

---

## 8. Local or SFTP-backed storage

Do not force the cloud presign flow onto a local/SFTP configuration.

Local storage commonly uses the SDK multipart method, such as `uploadToLocalStorage`, in one Blocks request. Follow the active backend and generated SDK contract for that provider.

Still apply these rules:

- send `accessModifier` and `objectAccessLevel` when supported;
- default new applications to `Private` and `Creator`;
- do not invent a completion call if the local upload response does not request one;
- handle returned verification status if the backend supplies it;
- use the same access-policy rules after creation.

Provider type and storage configuration are deployment inputs. An AI agent must inspect them before replacing an existing upload transport.

---

## 9. Upload UI requirements

Opening “Upload file” should show a modal or equivalent focused flow. At minimum it must include:

- file selector/drop zone;
- selected file name and size;
- destination directory context;
- object access level: `Creator` or `Organization`;
- byte visibility/access modifier: `Private` or `Public`;
- a clear warning when `Public` is selected;
- progress/status covering presign, byte upload, and verification;
- actionable failure text;
- retry behavior that follows the failure stage.

Recommended defaults:

```ts
const defaultAccessModifier = "Private";
const defaultObjectAccessLevel = "Creator";
```

Do not close the modal immediately after the provider PUT if completion is required. The upload is not finished until verification succeeds.

Retry rules:

| Failure stage | Retry action |
| --- | --- |
| Presign failed | Retry presign. No provider upload occurred. |
| Provider PUT failed or URL expired | Start a fresh presign/upload session unless the provider contract explicitly supports reuse. |
| Completion response timed out/was lost | Retry completion first with the same file and version IDs. |
| Completion returned `Rejected` | Start a completely new upload. Do not reuse the rejected version. |

---

## 10. Directory creation and access scope

Directories do not upload bytes, so they do not require a storage `AccessModifier`. They do require an application access scope.

Example:

```ts
await client.data.directories.create({
  name: "Contracts",
  parentDirectoryId: currentDirectoryId,
  configurationName: "Default",
  objectAccessLevel: "Creator", // or "Organization"
  description: "Signed customer contracts",
});
```

Directory creation UI should offer:

- `Creator`: creator/private workspace scope;
- `Organization`: organization-wide starting scope.

For new applications, default to `Creator`. Apply the same explicit migration rule described earlier when an older application omitted the property.

If supported by the product, directory payloads may also include allowed extensions or other configuration fields. Do not infer them from a different deployment.

---

## 11. Downloads and reads after upload

Request download URLs through the SDK. Do not build provider URLs from file IDs or storage keys.

Before opening or navigating to a URL:

1. confirm the Blocks response succeeded;
2. confirm a non-empty URL is present;
3. inspect `verificationStatus` when supplied.

Behavior:

```ts
if (!download.url) {
  if (download.verificationStatus === "Quarantined") {
    throw new Error("This file is still being verified and is not available yet.");
  }

  if (download.verificationStatus === "Rejected") {
    throw new Error("This file failed verification and cannot be downloaded.");
  }

  throw new Error("A download URL is not available.");
}
```

Download URLs are temporary. Request them on demand rather than persisting them as permanent application data.

---

## 12. Sharing and access-policy contract

Sharing means creating or changing access policies on a file or directory. It does not mean changing the owner and does not require changing `AccessModifier`.

Typical SDK operations:

- list direct policies: `accessPolicies`
- grant: `grantAccess`
- update: `updateAccess`
- revoke: `revokeAccess`
- resolve effective access: `resolveAccess`
- enable/disable inheritance: `toggleInheritance`

Method names can vary by generated SDK version. Use the corresponding SDK methods rather than manually calling Blocks endpoints.

### 12.1 Resource values

For access-policy payloads:

- file resource type: `"File"`
- directory resource type: `"Directory"`

Do not reuse a lowercase list-object discriminator (`"file"` or `"directory"`) without mapping it to the access API's expected casing.

### 12.2 `principalId` rules

The API field is spelled **`principalId`**, not `principleId`.

| Share target | `principalType` | `principalId` | `organizationId` |
| --- | --- | --- | --- |
| User | `User` | The user's stable user/item ID | omit |
| Global role | `Role` | The role **slug** | omit |
| Organization | `Organization` | The organization's item ID | omit |
| Role within an organization | `Role` | The role **slug** | The organization's item ID |
| Everyone | `Everyone` | omit | omit |

> [!CAUTION]
> For a role, never send the role database/item ID as `principalId`. Send the role's slug, such as `content-editor`.

### 12.3 Grant examples

User:

```json
{
  "resourceId": "file-or-directory-id",
  "resourceType": "File",
  "principalType": "User",
  "principalId": "user-item-id",
  "permission": "View"
}
```

Global role:

```json
{
  "resourceId": "file-or-directory-id",
  "resourceType": "Directory",
  "principalType": "Role",
  "principalId": "content-editor",
  "permission": "Edit"
}
```

Organization:

```json
{
  "resourceId": "file-or-directory-id",
  "resourceType": "Directory",
  "principalType": "Organization",
  "principalId": "organization-item-id",
  "permission": "View"
}
```

Organization-scoped role:

```json
{
  "resourceId": "file-or-directory-id",
  "resourceType": "Directory",
  "principalType": "Role",
  "principalId": "organization-admin",
  "organizationId": "organization-item-id",
  "permission": "Manage"
}
```

Everyone:

```json
{
  "resourceId": "file-or-directory-id",
  "resourceType": "File",
  "principalType": "Everyone",
  "permission": "View"
}
```

Optional access-policy fields can include:

- `expiresAt` for time-limited access;
- an allow/deny effect where supported;
- priority where supported by the API.

Do not send an empty string as `principalId` for `Everyone`; omit the field unless the generated SDK explicitly requires a nullable value.

### 12.4 Permissions

Supported permissions commonly include:

- `View`
- `Download`
- `Edit`
- `Delete`
- `Manage`
- `Owner`

Use the active backend/SDK enum as the source of truth. General UI rules:

- do not offer `Owner` as an ordinary sharing selection;
- show owner access as protected/read-only;
- require `Manage` to modify access policies;
- hide or disable actions that returned object permission flags disallow;
- still handle backend authorization errors because UI flags can be stale.

### 12.5 Existing access must remain visible

The share dialog is an access manager, not only a “send share” form.

Every time it opens:

1. Fetch direct access policies for the selected resource.
2. Show a loading state.
3. Resolve user IDs, organization IDs, and role slugs to readable names through IAM data.
4. Render permission, principal type, expiration, and owner/protected state.
5. Allow authorized users to update or revoke non-owner direct policies.
6. After every grant, update, or revoke, refetch the policy list.

Do not assume `accessPolicies` returns inherited entries. If the UI needs effective access, use `resolveAccess` or the appropriate inheritance-aware API and label direct versus inherited access clearly.

### 12.6 Update and revoke

When updating a policy, preserve its identity and unchanged semantic fields. Change only the intended values.

Conceptual update payload:

```jsonc
{
  "resourceId": "resource-id",
  "policyItemId": "policy-item-id",
  "resourceType": "File",
  "principalType": "Role",
  "principalId": "content-editor",
  "organizationId": "organization-id-if-scoped",
  "permission": "Manage",
  "effect": "Allow",
  "priority": 0
}
```

Conceptual revoke payload:

```json
{
  "resourceId": "resource-id",
  "policyItemId": "policy-item-id"
}
```

Use the installed SDK's exact field names. Refetch after success.

### 12.7 Inheritance safety

Before disabling inheritance on a directory or file, ensure the caller retains a direct `Allow` policy with sufficient access. The backend may reject disabling inheritance when no suitable direct policy exists. The UI should explain this instead of retrying blindly.

---

## 13. Listing, permissions, and deletion safety

Storage lists can contain both files and directories. Normalize the result into a discriminated model while preserving backend permission flags.

Typical flags include capabilities such as:

- can view/download;
- can edit/move;
- can delete;
- can manage access.

Use those flags consistently in list and tile views so both surfaces expose the same valid actions.

For trash behavior, explicitly request soft deletion:

```ts
await client.data.objects.delete({
  itemId,
  itemType,
  permanent: false,
});
```

Only use permanent deletion from an explicit purge action with suitable confirmation and authorization. Never omit `permanent` and assume the backend will choose trash.

---

## 14. Migration procedure for an existing application

An engineer or AI agent must complete this audit before changing code.

### Step 1: Read local instructions

- Read repository-level `AGENTS.md`, `CLAUDE.md`, or equivalent project guidance.
- Identify the package manager, lint/build/test commands, and local conventions.
- Check the installed `@seliseblocks/client` version.
- Locate the single configured Blocks client.
- Locate every upload entry point: modal, drag-and-drop, editor attachment, batch upload, and version upload.

### Step 2: Inventory the current contract

Record whether each item exists and works:

| Area | Required evidence |
| --- | --- |
| Presign | Uses the configured SDK client and returns file/version IDs. |
| Metadata | Sends exact size, MIME type, name, configuration, destination. |
| Access modifier | UI and payload support `Private`/`Public`; default is documented. |
| Object access level | UI and payload support `Creator`/`Organization`; legacy omission is documented. |
| Required headers | Provider PUT applies every returned header. |
| Credential isolation | Provider request contains no Blocks auth/cookies. |
| Completion | Conditional on `uploadCompletionRequired`; sends both IDs. |
| Verification | Handles `Quarantined`, `Verified`, `Rejected`, and rejection reason. |
| Downloads | Refuses to open missing URLs for quarantined/rejected versions. |
| Versions | Existing file ID is used for version upload. |
| Folders | Creation supports `objectAccessLevel`. |
| Sharing | Uses direct policy APIs and lists existing policies. |
| Role identity | Sends role slug, not role ID. |
| User identity | Sends stable user/item ID. |
| Organization identity | Sends organization item ID. |
| Org role | Sends role slug plus organization ID. |
| Refresh | Refetches policies after grant/update/revoke. |
| Owner safety | Owner policy cannot be removed in normal UI. |
| View parity | List and tile menus use the same capability/action rules. |
| Deletion | Soft delete explicitly sends `permanent: false`. |

### Step 3: Decide migration compatibility

Before changing access defaults, answer:

1. What did an omitted `objectAccessLevel` mean in this deployment?
2. Which existing users rely on that behavior?
3. Should only new uploads use `Creator`, or should existing objects be migrated?
4. Is a backend/data migration required for existing objects?
5. Does `Public` already have product-specific meaning that differs from the default UI wording?

Do not perform a bulk access migration as a side effect of a frontend feature.

### Step 4: Centralize the upload flow

- Add one upload orchestrator.
- Route all upload entry points through it.
- Add the narrow completion adapter only if the installed SDK lacks the method.
- Preserve existing client configuration and authentication callbacks.
- Remove duplicate local success handling that fires before verification.

### Step 5: Upgrade the UI

- Add upload choices and safe defaults.
- Add creator/organization choice to folder creation.
- Make list and tile actions identical for equivalent objects and permissions.
- Convert the share form into an access manager that displays existing direct policies.
- Add loading, empty, error, and mutation-pending states.

### Step 6: Verify outgoing requests

In a safe development tenant, inspect requests and confirm:

- the presign payload contains intended access fields;
- the provider PUT has required provider headers and no Blocks credentials;
- completion occurs only when requested;
- completion contains the same IDs returned by presign;
- role shares contain the role slug;
- user shares contain the user ID;
- organization-scoped roles contain both role slug and organization ID.

### Step 7: Run automated and manual checks

Run lint, typecheck, build, and the relevant tests. Then execute the acceptance tests below.

---

## 15. Greenfield implementation procedure

For a new application:

1. Install and configure `@seliseblocks/client` using the application's existing authentication source.
2. Create one shared client module.
3. Create a storage adapter for files, directories, objects, and any completion compatibility method.
4. Create an access-policy adapter with a single principal-payload builder.
5. Implement object listing with pagination and permission flags.
6. Implement the upload modal and the three-stage conditional flow.
7. Implement folder creation with `objectAccessLevel`.
8. Implement download gating by verification status.
9. Implement the access manager with existing-policy visibility.
10. Implement trash/restore/purge with explicit deletion intent.
11. Add test doubles or integration fixtures for each verification and sharing variant.
12. Run the acceptance suite before exposing `Public` or organization-wide options to users.

Suggested modules:

```text
src/lib/blocks/client.ts
src/lib/blocks/storage.ts
src/lib/blocks/accessPolicies.ts
src/features/storage/uploadFile.ts
src/features/storage/downloadFile.ts
src/features/storage/components/UploadDialog.tsx
src/features/storage/components/CreateFolderDialog.tsx
src/features/storage/components/AccessManagerDialog.tsx
```

Use the application's conventions rather than forcing these exact paths.

---

## 16. Error-handling matrix

| Condition | Required behavior |
| --- | --- |
| Blocks presign rejects request | Show Blocks validation/error message when safe; do not contact provider. |
| Presign response lacks URL or file ID | Treat as invalid response; stop. |
| Completion required but version ID absent | Treat as invalid response; do not claim success. |
| Provider returns non-success | Mark upload failed; offer a fresh session/retry. |
| Provider request blocked by CORS | Report deployment/configuration error; include required origin/method/headers in diagnostics. |
| Signed URL expired | Start a fresh presign session. |
| Completion timeout | Retry completion with the same IDs. |
| Completion rejected | Show mapped reason and start a new upload when retried. |
| Download URL missing + quarantined | Show verification-pending state. |
| Download URL missing + rejected | Show permanent version failure. |
| Access grant conflicts with existing policy | Refresh policies and guide user to update the existing entry. |
| Share target cannot be resolved | Do not invent an ID; require a selected IAM record. |
| Unauthorized mutation | Refresh permissions/policies and show that access changed or is insufficient. |
| Owner revoke attempted | Block in UI and preserve backend error handling. |

---

## 17. Acceptance tests

The implementation is not complete until the applicable tests pass.

### Upload and completion

- Upload a private, creator-scoped file when completion is not required.
- Upload a private, creator-scoped file when completion is required and returns `Verified`.
- Upload an organization-scoped file and confirm the presign payload.
- Upload a public file only after the UI warning/explicit choice.
- Confirm all `requiredHeaders` reach the provider PUT.
- Confirm no Blocks auth header or cookie reaches the provider URL.
- Simulate an expired provider URL and verify a new session is used.
- Simulate provider failure after successful presign and verify a recoverable failure is shown.
- Simulate a lost completion response and verify completion retries with the same IDs.
- Simulate `checksum_mismatch` and confirm the version is rejected and not reused.
- Simulate every known rejection code and confirm readable UI output.
- Confirm no success state is shown before required completion succeeds.

### Download and verification

- A verified file opens through a newly requested URL.
- A quarantined file does not attempt navigation to an empty URL.
- A rejected file does not attempt download.
- Temporary download URLs are not stored as permanent file metadata.

### File versions

- Upload a new version with the original file ID as `itemId`.
- Confirm the new `fileVersionId` is used for completion.
- Confirm rejection affects the candidate version and does not overwrite the last valid version in the UI.

### Directories

- Create a creator-scoped directory.
- Create an organization-scoped directory.
- Confirm directory creation does not send a meaningless byte `AccessModifier`.

### Sharing

- Share with a user and confirm `principalId` equals the user ID.
- Share with a global role and confirm `principalId` equals the role slug, not the role item ID.
- Share with an organization and confirm `principalId` equals the organization ID.
- Share with an organization-scoped role and confirm role slug plus `organizationId`.
- Share with everyone and confirm `principalId` is omitted.
- Close and reopen the dialog; confirm all current direct policies remain visible.
- Update a permission and confirm the policy list refreshes.
- Revoke a non-owner policy and confirm the list refreshes.
- Confirm owner access cannot be removed.
- Confirm inherited and direct access are not mislabeled.
- Confirm a user without `Manage` cannot mutate access.

### General safety

- List and tile views show the same valid actions for the same object.
- Soft delete sends `permanent: false`.
- Permanent delete requires an explicit purge action and confirmation.
- Lint, typecheck, tests, and production build pass.

---

## 18. Security review checklist

- [ ] New uploads default to `Private`.
- [ ] New objects default to `Creator`, or the documented migration choice is applied.
- [ ] `Public` includes a clear confidentiality warning.
- [ ] Blocks credentials never reach provider URLs.
- [ ] Provider headers are limited to the signed-upload contract.
- [ ] Completion IDs come only from the matching presign response.
- [ ] Rejected versions cannot be downloaded or reused.
- [ ] Download URLs are requested on demand.
- [ ] Role access uses role slugs.
- [ ] User and organization access use stable IDs.
- [ ] Organization-scoped roles include `organizationId`.
- [ ] Everyone access omits `principalId`.
- [ ] Owner policies are protected.
- [ ] Access mutations require `Manage` and remain backend-authorized.
- [ ] Inheritance cannot be disabled in a way that accidentally locks out the manager.
- [ ] Soft deletion is explicit.
- [ ] Logs do not persist signed URLs, access tokens, or sensitive headers.

---

## 19. Instructions for an AI coding agent

When this document is supplied to an AI agent, use the following implementation protocol.

### Required behavior

1. Read all repository instructions before editing.
2. Inspect the current implementation and installed SDK; do not assume the project is greenfield.
3. Reuse the configured Blocks client and existing authentication flow.
4. Implement the smallest complete change that satisfies this contract.
5. Do not silently change existing access semantics.
6. Do not invent IDs, enum values, endpoint paths, storage configuration names, or provider behavior.
7. Prefer native SDK methods. Add only a narrow typed compatibility adapter when the installed SDK lacks upload completion.
8. Centralize upload orchestration and principal payload construction.
9. Preserve unrelated user changes in the working tree.
10. Verify with lint/typecheck/build/tests and report exactly what was run.

### Questions the agent must answer from the code/configuration

- Which Blocks client version is installed?
- Does it expose native upload completion?
- Is the storage configuration cloud/object storage or local/SFTP?
- What is the real `configurationName`?
- What representation does this application use for the root directory?
- Does the existing app omit `objectAccessLevel`, and what compatibility behavior is required?
- Where are user IDs, role slugs, and organization IDs obtained?
- Which screens can initiate upload or sharing?
- Which permission flags are returned on listed objects?

If a required answer cannot be found and guessing could change security, data visibility, or compatibility, stop and ask for the missing product/deployment decision.

### Definition of done for the agent

The agent should not report completion until:

- upload uses presign, provider PUT, and conditional completion correctly;
- verification failures are handled;
- access choices are present in upload and directory UI where applicable;
- existing direct shares are visible;
- role/user/organization payload identities follow this guide;
- equivalent object views expose equivalent actions;
- the relevant automated checks pass;
- remaining deployment requirements, especially provider CORS or backend configuration, are explicitly reported.

---

## 20. Reference implementations in this workspace

When this guide is used inside the `bwb` workspace, these files are useful behavioral references:

- `dms-app/src/lib/blocks/files.ts` — upload completion and verification compatibility handling.
- `dms-app/LEGACY_APP_STORAGE_COMPATIBILITY.md` — background compatibility details.
- `blx-drive/src/lib/blocks/storage.ts` — narrow completion adapter.
- `blx-drive/src/features/vault/vaultApi.ts` — upload orchestration and sharing payloads.
- `blx-drive/src/features/vault/components/UploadDialog.tsx` — upload access choices and progress UI.
- `blx-drive/src/features/vault/components/ShareDialog.tsx` — direct-policy access manager.

Use them as references, not as permission to copy deployment-specific constants into another application.

---

## 21. Final implementation summary

A safe implementation has four independent layers:

1. **Byte protection:** `AccessModifier`, normally `Private`.
2. **Default audience:** `ObjectAccessLevel`, normally `Creator` for new applications.
3. **Upload integrity:** presign, exact provider PUT, and conditional completion/verification.
4. **Ongoing authorization:** direct and inherited access policies using correct principal identities.

All four must be implemented. A file that uploads successfully but skips required completion is incomplete. A file that verifies correctly but uses the wrong role identifier is shared incorrectly. A private provider object with legacy allow-all application access is not creator-private. Treat upload, verification, byte visibility, object scope, and access policies as related but distinct contracts.
