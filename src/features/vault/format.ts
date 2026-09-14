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
