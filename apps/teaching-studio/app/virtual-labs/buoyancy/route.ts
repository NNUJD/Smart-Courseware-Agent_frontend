import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl =
  process.env.TEACHING_BACKEND_BASE_URL ?? "http://127.0.0.1:8000";

const internalBackendHosts = new Set(["backend", "smartcourse-backend"]);
const internalBrowserHosts = new Set(["0.0.0.0", "::"]);

const resolveRequestHostname = (request: NextRequest) => {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const rawHost = forwardedHost?.split(",")[0]?.trim() || hostHeader?.trim();

  if (rawHost) {
    try {
      const requestUrl = new URL(`http://${rawHost}`);
      if (!internalBrowserHosts.has(requestUrl.hostname)) {
        return requestUrl.hostname;
      }
    } catch {
      return "127.0.0.1";
    }
  }

  if (!internalBrowserHosts.has(request.nextUrl.hostname)) {
    return request.nextUrl.hostname;
  }

  return "127.0.0.1";
};

const resolveBrowserBackendBaseUrl = (request: NextRequest) => {
  const configured = backendBaseUrl.replace(/\/$/, "");

  try {
    const target = new URL(configured);
    if (internalBackendHosts.has(target.hostname)) {
      target.hostname = resolveRequestHostname(request);
      target.port = "8000";
    }
    return target.toString().replace(/\/$/, "");
  } catch {
    return `http://${resolveRequestHostname(request)}:8000`;
  }
};

export function GET(request: NextRequest) {
  const target = `${resolveBrowserBackendBaseUrl(request)}/virtual-labs/buoyancy`;
  return NextResponse.redirect(target);
}
