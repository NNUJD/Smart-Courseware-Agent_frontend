import { generateId } from "ai";
import type { AttachmentAdapter } from "@assistant-ui/react";
import type {
  Attachment,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/core";

export const teachingAttachmentAccept =
  "image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,text/plain,text/markdown,.md";

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });

const getAttachmentType = (mimeType: string, fileName: string) => {
  if (mimeType.startsWith("image/")) return "image" as const;

  const lowered = fileName.toLowerCase();
  if (
    mimeType === "application/pdf" ||
    lowered.endsWith(".doc") ||
    lowered.endsWith(".docx") ||
    lowered.endsWith(".ppt") ||
    lowered.endsWith(".pptx")
  ) {
    return "document" as const;
  }

  return "file" as const;
};

export class TeachingAttachmentAdapter implements AttachmentAdapter {
  public accept = teachingAttachmentAccept;

  public async add({ file }: { file: File }): Promise<PendingAttachment> {
    return {
      id: generateId(),
      type: getAttachmentType(file.type, file.name),
      name: file.name,
      file,
      contentType: file.type,
      content: [],
      status: { type: "requires-action", reason: "composer-send" } as const,
    };
  }

  public async send(
    attachment: PendingAttachment,
  ): Promise<CompleteAttachment> {
    if (attachment.type === "image") {
      return {
        ...attachment,
        status: { type: "complete" as const },
        content: [
          {
            type: "image" as const,
            image: await readAsDataUrl(attachment.file),
          },
        ],
      };
    }

    return {
      ...attachment,
      status: { type: "complete" as const },
      content: [
        {
          type: "file" as const,
          mimeType: attachment.contentType ?? "",
          filename: attachment.name,
          data: await readAsDataUrl(attachment.file),
        },
      ],
    };
  }

  public async remove(_attachment: Attachment): Promise<void> {
    return;
  }
}
