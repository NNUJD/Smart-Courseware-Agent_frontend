import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { backendArtifactRoot } from "../../_lib/backend-paths";

const resolveSafeArtifactPath = (input: string) => {
  const resolved = path.resolve(input);
  const allowedRoot = path.resolve(backendArtifactRoot);

  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("media_path_not_allowed");
  }

  return resolved;
};

const inferContentType = (targetPath: string) => {
  const lowered = targetPath.toLowerCase();
  if (lowered.endsWith(".mp4")) return "video/mp4";
  if (lowered.endsWith(".webm")) return "video/webm";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/octet-stream";
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const localPath = searchParams.get("path");

  if (!localPath) {
    return Response.json({ error: "media_path_required" }, { status: 400 });
  }

  try {
    const safePath = resolveSafeArtifactPath(localPath);
    await access(safePath);
    const buffer = await readFile(safePath);

    return new Response(buffer, {
      headers: {
        "Content-Type": inferContentType(safePath),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "media_file_failed";

    return Response.json(
      {
        error: "media_file_failed",
        detail,
      },
      { status: 500 },
    );
  }
}
