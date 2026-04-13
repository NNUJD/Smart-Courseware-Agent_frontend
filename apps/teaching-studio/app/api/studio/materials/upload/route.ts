import type {
  MaterialRole,
  MaterialUploadResponse,
} from "@/lib/studio-contract";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { backendArtifactRoot } from "../../../_lib/backend-paths";

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";
const backendIngestEndpoint = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/knowledge/upload-and-ingest`;
const materialUploadRoot = path.join(backendArtifactRoot, ".studio-materials");

const backendIngestableSuffixes = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".json",
  ".yml",
  ".yaml",
]);

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

const getFileSuffix = (fileName: string) => {
  const lowered = fileName.toLowerCase();
  const lastDot = lowered.lastIndexOf(".");
  if (lastDot === -1) return "";
  return lowered.slice(lastDot);
};

const canIngestWithBackend = (fileName: string) => {
  const suffix = getFileSuffix(fileName);
  return backendIngestableSuffixes.has(suffix);
};

const buildFallbackSummary = (fileName: string, mimeType: string) => {
  if (mimeType.startsWith("video/")) {
    return `已上传视频资料《${fileName}》，当前后端暂未接入视频摘要与关键帧解析，先作为参考素材保存。`;
  }

  if (mimeType.startsWith("image/")) {
    return `已上传图片资料《${fileName}》，当前后端暂未接入图像语义解析，先作为风格参考保存。`;
  }

  return `已上传文件《${fileName}》，当前后端暂未解析该格式，先作为参考资料保存。`;
};

type BackendIngestResponse = {
  filename: string;
  source: string;
  document_count: number;
  chunk_count: number;
  ingested_document_count: number;
  ingested_chunk_count: number;
  retrieval_mode: string;
};

const buildMaterialResponse = ({
  id,
  name,
  mimeType,
  size,
  storedPath,
  parseSummary,
  suggestedRole,
}: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  storedPath: string;
  parseSummary: string;
  suggestedRole: MaterialRole;
}): MaterialUploadResponse => ({
  material: {
    id,
    name,
    mimeType,
    size,
    storedPath,
    createdAt: new Date().toISOString(),
    status: "ready",
    parseSummary,
    suggestedRole,
  },
});

const sanitizeFileName = (fileName: string) => {
  const withoutReservedChars = fileName.trim().replace(/[<>:"/\\|?*]/g, "_");
  const normalized = Array.from(withoutReservedChars)
    .filter((char) => char >= " ")
    .join("");
  return normalized || "material";
};

const buildStoredFilePath = (id: string, fileName: string) => {
  const safeName = sanitizeFileName(fileName);
  return path.join(materialUploadRoot, `${id}-${safeName}`);
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "missing_file" }, { status: 400 });
  }

  const suggestedRole = inferSuggestedRole(file.name, file.type);
  const id = crypto.randomUUID();
  const mimeType = file.type || "application/octet-stream";
  await mkdir(materialUploadRoot, { recursive: true });

  const storedPath = buildStoredFilePath(id, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storedPath, fileBuffer);

  if (!canIngestWithBackend(file.name)) {
    return Response.json(
      buildMaterialResponse({
        id,
        name: file.name,
        mimeType,
        size: file.size,
        storedPath,
        parseSummary: buildFallbackSummary(file.name, mimeType),
        suggestedRole,
      }),
    );
  }

  const backendForm = new FormData();
  backendForm.append("file", file, file.name);

  const backendResponse = await fetch(backendIngestEndpoint, {
    method: "POST",
    body: backendForm,
  });

  if (!backendResponse.ok) {
    const detail = await backendResponse.text();
    return Response.json(
      {
        error: "backend_upload_failed",
        detail: detail || "Backend upload-and-ingest endpoint failed.",
      },
      { status: backendResponse.status },
    );
  }

  const payload = (await backendResponse.json()) as BackendIngestResponse;
  const parseSummary = `已上传并完成入库《${payload.filename}》，本次新增 ${payload.ingested_chunk_count} 个知识片段，当前总片段 ${payload.chunk_count}，检索模式为 ${payload.retrieval_mode}。`;

  return Response.json(
    buildMaterialResponse({
      id,
      name: file.name,
      mimeType,
      size: file.size,
      storedPath,
      parseSummary,
      suggestedRole,
    }),
  );
}
