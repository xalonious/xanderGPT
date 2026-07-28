export const MAX_IMAGE_COUNT = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const SUPPORTED_IMAGE_TYPES = new Set(IMAGE_ACCEPT.split(","));
const MAX_IMAGE_EDGE = 1024;

export type AttachmentUpload = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  size: number;
  data: string;
  previewUrl: string;
};

function replaceExtension(name: string, extension: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "image"}.${extension}`;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not optimize image"))),
      mimeType,
      quality
    );
  });
}

async function optimizeImage(file: File): Promise<{ blob: Blob; name: string; mimeType: string }> {
  if (file.type === "image/gif") {
    return { blob: file, name: file.name, mimeType: file.type };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, name: file.name, mimeType: file.type };
  }

  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const needsResize = scale < 1;
    const needsCompression = file.size > MAX_IMAGE_BYTES;

    if (!needsResize && !needsCompression) {
      return { blob: file, name: file.name, mimeType: file.type };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
    return {
      blob,
      name: replaceExtension(file.name, "jpg"),
      mimeType: "image/jpeg",
    };
  } finally {
    bitmap.close();
  }
}

export async function prepareImageUpload(file: File): Promise<AttachmentUpload> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name} is not a supported image`);
  }

  const optimized = await optimizeImage(file);
  if (optimized.blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name} is larger than 8 MB after optimization`);
  }

  const previewUrl = await fileToDataUrl(optimized.blob);
  const commaIndex = previewUrl.indexOf(",");
  if (commaIndex === -1) throw new Error(`Could not encode ${file.name}`);

  return {
    id: `local-attachment-${crypto.randomUUID()}`,
    kind: "image",
    name: optimized.name,
    mimeType: optimized.mimeType,
    size: optimized.blob.size,
    data: previewUrl.slice(commaIndex + 1),
    previewUrl,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function toAttachmentPayload(attachment: AttachmentUpload) {
  return {
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    data: attachment.data,
  };
}
