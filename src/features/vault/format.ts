import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Folder } from "lucide-react";
import type { VaultObject } from "./types";

const ICONS_BY_EXTENSION: Record<string, typeof File> = {
  csv: FileSpreadsheet,
  doc: FileText,
  docx: FileText,
  gif: FileImage,
  jpeg: FileImage,
  jpg: FileImage,
  mov: FileVideo,
  mp3: FileAudio,
  mp4: FileVideo,
  pdf: FileText,
  png: FileImage,
  ppt: FileText,
  pptx: FileText,
  rar: FileArchive,
  svg: FileImage,
  txt: FileText,
  wav: FileAudio,
  webp: FileImage,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  zip: FileArchive
};

export function iconForObject(object: VaultObject): typeof File {
  if (object.type === "directory") return Folder;
  const extension = object.extension?.replace(/^\./, "").toLowerCase();
  return (extension && ICONS_BY_EXTENSION[extension]) || File;
}

const COLOR_CLASS_BY_EXTENSION: Record<string, string> = {
  csv: "vault-icon-sheet",
  doc: "vault-icon-doc",
  docx: "vault-icon-doc",
  gif: "vault-icon-image",
  jpeg: "vault-icon-image",
  jpg: "vault-icon-image",
  mov: "vault-icon-media",
  mp3: "vault-icon-media",
  mp4: "vault-icon-media",
  pdf: "vault-icon-pdf",
  png: "vault-icon-image",
  ppt: "vault-icon-slide",
  pptx: "vault-icon-slide",
  rar: "vault-icon-archive",
  svg: "vault-icon-image",
  txt: "vault-icon-doc",
  wav: "vault-icon-media",
  webp: "vault-icon-image",
  xls: "vault-icon-sheet",
  xlsx: "vault-icon-sheet",
  zip: "vault-icon-archive"
};

// A Drive-style color hint by file kind, distinct from the folder color, so
// a dense list scans faster than every row's icon reading identically.
export function iconColorClassFor(object: VaultObject): string {
  if (object.type === "directory") return "vault-icon-folder";
  const extension = object.extension?.replace(/^\./, "").toLowerCase();
  return (extension && COLOR_CLASS_BY_EXTENSION[extension]) || "vault-icon-file";
}

export function isPreviewable(object: VaultObject): "image" | "pdf" | undefined {
  const extension = object.extension?.replace(/^\./, "").toLowerCase();
  const contentType = object.contentType ?? "";
  if (contentType.startsWith("image/") || ["gif", "jpeg", "jpg", "png", "svg", "webp"].includes(extension ?? "")) return "image";
  if (contentType === "application/pdf" || extension === "pdf") return "pdf";
  return undefined;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
