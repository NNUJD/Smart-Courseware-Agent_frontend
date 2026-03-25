"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudioStore } from "@/lib/studio-store";

const readFileNameFromDisposition = (header: string | null) => {
  if (!header) return null;
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
};

export const ExportButton = () => {
  const [isExporting, setIsExporting] = useState(false);
  const activeArtifact = useStudioStore((state) => state.activeArtifact);
  const artifacts = useStudioStore((state) => state.artifacts);
  const materials = useStudioStore((state) => state.materials);
  const intentDraft = useStudioStore((state) => state.intentDraft);
  const currentProjectId = useStudioStore((state) => state.currentProjectId);
  const latestPrompt = useStudioStore((state) => state.latestPrompt);
  const conversation = useStudioStore((state) => state.conversation);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await fetch("/api/studio/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activeArtifact,
          projectId: currentProjectId || undefined,
          intentDraft,
          materials,
          artifacts,
          latestPrompt,
          conversation,
        }),
      });

      if (!response.ok) {
        throw new Error("export_failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        readFileNameFromDisposition(
          response.headers.get("Content-Disposition"),
        ) ?? artifacts[activeArtifact].downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      type="button"
      className="rounded-full"
      disabled={isExporting}
      onClick={() => void handleExport()}
    >
      {isExporting ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      一键下载
    </Button>
  );
};
