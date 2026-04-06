import path from "node:path";

const configuredArtifactRoot =
  process.env.TEACHING_BACKEND_ARTIFACT_ROOT?.trim();

export const backendArtifactRoot =
  configuredArtifactRoot ||
  path.resolve(
    process.cwd(),
    "..",
    "..",
    "..",
    "Smart-Courseware-Agent_backend",
    "backend",
    "app",
    "agent",
    "data_assets",
    "demo_show",
  );
