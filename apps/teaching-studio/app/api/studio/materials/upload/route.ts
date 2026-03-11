import type {
  MaterialRole,
  MaterialUploadResponse,
} from "@/lib/studio-contract";

const inferSuggestedRole = (
  fileName: string,
  mimeType: string,
): MaterialRole => {
  const lowered = fileName.toLowerCase();

  if (mimeType.startsWith("video/")) return "media";
  if (mimeType.startsWith("image/")) return "style";
  if (lowered.endsWith(".ppt") || lowered.endsWith(".pptx")) return "format";
  if (lowered.endsWith(".pdf")) return "knowledge";
  if (lowered.endsWith(".doc") || lowered.endsWith(".docx")) return "knowledge";

  return "case";
};

const inferSummary = (fileName: string, mimeType: string) => {
  if (mimeType.startsWith("video/")) {
    return `已接收视频素材《${fileName}》，后端可在此接入视频摘要、关键帧抽取与分镜标签能力。`;
  }

  if (mimeType.startsWith("image/")) {
    return `已接收图片资料《${fileName}》，后端可在此接入版式识别、图示提取与视觉风格分析。`;
  }

  return `已接收文档《${fileName}》，后端可在此接入 PDF / Word / PPT 文本解析、结构切块与知识点抽取。`;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "missing_file" }, { status: 400 });
  }

  const response: MaterialUploadResponse = {
    material: {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      createdAt: new Date().toISOString(),
      status: "ready",
      parseSummary: inferSummary(file.name, file.type),
      suggestedRole: inferSuggestedRole(file.name, file.type),
    },
  };

  return Response.json(response);
}
