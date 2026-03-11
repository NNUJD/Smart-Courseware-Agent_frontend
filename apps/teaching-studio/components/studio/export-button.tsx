"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudioStore } from "@/lib/studio-store";

export const ExportButton = () => {
  const [isExporting, setIsExporting] = useState(false);
  const artifacts = useStudioStore((state) => state.artifacts);
  const materials = useStudioStore((state) => state.materials);
  const intentDraft = useStudioStore((state) => state.intentDraft);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await fetch("/api/studio/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intentDraft,
          materials,
          artifacts,
        }),
      });

      if (!response.ok) {
        throw new Error("export_failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "teaching-studio-export.json";
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
