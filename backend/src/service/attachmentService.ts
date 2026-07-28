import ServiceError from "../core/ServiceError";

export const MAX_ATTACHMENT_COUNT = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type IncomingAttachment = {
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
};

export type PreparedAttachment = {
  kind: "image";
  name: string;
  mimeType: string;
  size: number;
  data: Buffer;
  extractedText: null;
};

export type AttachmentMetadata = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
};

function invalid(message: string): never {
  throw ServiceError.validationFailed(message);
}

function hasExpectedSignature(data: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  if (mimeType === "image/gif") {
    const signature = data.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return (
      data.length >= 12 &&
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

function decodeBase64(value: string): Buffer {
  const normalized = value.replace(/\s+/g, "");
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    invalid("Attachment data is not valid base64");
  }

  return Buffer.from(normalized, "base64");
}

export function prepareAttachments(
  attachments: IncomingAttachment[] | undefined,
  maxTotalBytes = MAX_TOTAL_ATTACHMENT_BYTES
): PreparedAttachment[] {
  const values = attachments ?? [];
  if (values.length > MAX_ATTACHMENT_COUNT) {
    invalid(`You can attach up to ${MAX_ATTACHMENT_COUNT} images per message`);
  }

  const prepared = values.map((attachment, index): PreparedAttachment => {
    if (attachment.kind !== "image") {
      invalid(`Attachment ${index + 1} has an unsupported type`);
    }

    const name = String(attachment.name ?? "").trim();
    if (!name || name.length > 255) {
      invalid(`Attachment ${index + 1} has an invalid file name`);
    }

    const mimeType = String(attachment.mimeType ?? "").toLowerCase();
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      invalid(`${name} is not a supported image type`);
    }

    const data = decodeBase64(String(attachment.data ?? ""));
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
      invalid(`${name} must be smaller than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    }

    if (attachment.size !== data.length) {
      invalid(`${name} has an invalid file size`);
    }

    if (!hasExpectedSignature(data, mimeType)) {
      invalid(`${name} does not match its declared image type`);
    }

    return {
      kind: "image",
      name,
      mimeType,
      size: data.length,
      data,
      extractedText: null,
    };
  });

  const totalBytes = prepared.reduce((sum, attachment) => sum + attachment.size, 0);
  if (totalBytes > maxTotalBytes) {
    invalid(`Attachments must total less than ${maxTotalBytes / 1024 / 1024} MB`);
  }

  return prepared;
}

export function attachmentLabel(
  content: string,
  attachments: Array<Pick<PreparedAttachment, "kind" | "name">>
): string {
  if (attachments.length === 0) return content;

  const names = attachments.map((attachment) => attachment.name).join(", ");
  const note = `[Attached ${attachments.length === 1 ? "image" : "images"}: ${names}]`;
  const trimmed = content.trim();

  return trimmed ? `${trimmed}\n\n${note}` : `Please analyze the attached image${attachments.length === 1 ? "" : "s"}.\n\n${note}`;
}

export function attachmentImages(
  attachments: Array<Pick<PreparedAttachment, "kind" | "data">>
): string[] | undefined {
  const images = attachments
    .filter((attachment) => attachment.kind === "image")
    .map((attachment) => Buffer.from(attachment.data).toString("base64"));

  return images.length > 0 ? images : undefined;
}

export const attachmentMetadataSelect = {
  id: true,
  kind: true,
  name: true,
  mimeType: true,
  size: true,
} as const;
