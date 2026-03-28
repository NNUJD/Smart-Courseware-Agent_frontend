import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const backendArtifactRoot =
  process.env.TEACHING_BACKEND_ARTIFACT_ROOT ??
  path.resolve(
    process.cwd(),
    "../Smart-Courseware-Agent_backend/backend/app/agent/data_assets/demo_show",
  );

const sofficePath = process.env.SOFFICE_PATH ?? "/opt/homebrew/bin/soffice";

const resolveSafeArtifactPath = (input: string) => {
  const resolved = path.resolve(input);
  const allowedRoot = path.resolve(backendArtifactRoot);

  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("preview_path_not_allowed");
  }

  return resolved;
};

const ensurePdfPreview = async (sourcePath: string) => {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".pdf") return sourcePath;

  if (extension !== ".pptx" && extension !== ".docx") {
    throw new Error("preview_file_type_not_supported");
  }

  const previewDir = path.join(path.dirname(sourcePath), ".preview_cache");
  const pdfPath = path.join(
    previewDir,
    `${path.basename(sourcePath, extension)}.pdf`,
  );

  await mkdir(previewDir, { recursive: true });

  const [sourceMeta, previewMeta] = await Promise.all([
    stat(sourcePath),
    stat(pdfPath).catch(() => null),
  ]);

  const needsRefresh =
    !previewMeta || previewMeta.mtimeMs < sourceMeta.mtimeMs;

  if (needsRefresh) {
    await execFileAsync(sofficePath, [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      previewDir,
      sourcePath,
    ]);
  }

  return pdfPath;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localPath = searchParams.get("path");

  if (!localPath) {
    return Response.json(
      { error: "preview_path_required" },
      { status: 400 },
    );
  }

  try {
    const safePath = resolveSafeArtifactPath(localPath);
    await access(safePath);

    const previewPath = await ensurePdfPreview(safePath);
    const buffer = await readFile(previewPath);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "preview_file_failed";

    return Response.json(
      {
        error: "preview_file_failed",
        detail,
      },
      { status: 500 },
    );
  }
}
