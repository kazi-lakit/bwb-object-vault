# BLX Drive

BLX Drive is a React + Vite document-management application built on SELISE Blocks. It follows the proven DMS workflows in the sibling `dms-app`, adapted to the current `@seliseblocks/client` storage APIs and the scaffold's cookie-backed OIDC architecture.

## Features

- Personal-drive onboarding and organization-aware browsing
- System files and content shared with the current user
- Folder creation, multi-file upload, drag-and-drop, search, and grid/list views
- Image, PDF, audio, and video previews plus downloads
- Rename, move, file copy, sharing, and version-history downloads
- Soft deletion with a Trash view, restore, and confirmed permanent deletion
- Permission-gated actions based on each storage object's returned capabilities

All Blocks calls go through the single SDK client in `src/lib/blocks/client.ts`. The app does not persist Blocks tokens in browser storage and does not use raw HTTP calls for Blocks storage operations.

## Local setup

```bash
npm install
npm run cert
npm run dev
```

Populate the public `VITE_BLOCKS_*` variables in `.env`. Hosted login must run over HTTPS on the project's registered domain; add the exact `/login/callback` URL, including the development port, to the public OIDC client.

## Verification

```bash
npm run lint
npm run build
```

## Deployment

The included `Dockerfile` and `nginx.conf` follow the Blocks Release convention. Environment builds are available as `build:dev`, `build:test`, `build:stg`, `build:iat`, `build:uat`, `build:preprod`, `build:prodshadow`, and `build:prod`. Each writes the matching public release environment file into `dist/`.
