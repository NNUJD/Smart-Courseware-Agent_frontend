import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const getSofficeCandidates = () => {
  const configured = process.env.SOFFICE_PATH?.trim();
  if (configured) return [configured];

  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      "soffice.exe",
      "soffice",
    ];
  }

  if (process.platform === "darwin") {
    return [
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "/opt/homebrew/bin/soffice",
      "/usr/local/bin/soffice",
      "soffice",
    ];
  }

  return ["/usr/bin/soffice", "/usr/local/bin/soffice", "soffice"];
};

const isMissingExecutableError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("ENOENT") ||
    error.message.includes("not found") ||
    error.message.includes("not recognized")
  );
};

const convertToPdf = async (sourcePath: string, previewDir: string) => {
  let lastError: unknown = null;

  for (const candidate of getSofficeCandidates()) {
    try {
      if (path.isAbsolute(candidate)) {
        await access(candidate);
      }

      await execFileAsync(candidate, [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        previewDir,
        sourcePath,
      ]);
      return;
    } catch (error) {
      lastError = error;
      if (isMissingExecutableError(error)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw new Error(
      "soffice_not_found: install LibreOffice or set SOFFICE_PATH to the soffice executable",
    );
  }
};

const resolveSafeArtifactPath = (input: string) => {
  const resolved = path.resolve(input);
  const extension = path.extname(resolved).toLowerCase();
  const allowedExtensions = new Set([".pdf", ".pptx", ".docx"]);

  if (!path.isAbsolute(resolved)) {
    throw new Error("preview_path_not_absolute");
  }

  if (!allowedExtensions.has(extension)) {
    throw new Error("preview_file_type_not_supported");
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

  const needsRefresh = !previewMeta || previewMeta.mtimeMs < sourceMeta.mtimeMs;

  if (needsRefresh) {
    await convertToPdf(sourcePath, previewDir);
  }

  return pdfPath;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localPath = searchParams.get("path");

  if (!localPath) {
    return Response.json({ error: "preview_path_required" }, { status: 400 });
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
