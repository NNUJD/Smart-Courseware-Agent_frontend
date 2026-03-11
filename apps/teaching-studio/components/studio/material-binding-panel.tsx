"use client";

import { useRef, useState } from "react";
import { FileStack, Link2, LoaderCircle, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  MaterialRole,
  MaterialUploadResponse,
} from "@/lib/studio-contract";
import { useStudioStore } from "@/lib/studio-store";
import { teachingAttachmentAccept } from "@/lib/teaching-attachment-adapter";

const materialRoleOptions: Array<{ value: MaterialRole; label: string }> = [
  { value: "knowledge", label: "知识参考" },
  { value: "format", label: "格式参考" },
  { value: "style", label: "风格参考" },
  { value: "case", label: "案例素材" },
  { value: "media", label: "多媒体素材" },
];

export const MaterialBindingPanel = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const materials = useStudioStore((state) => state.materials);
  const addMaterial = useStudioStore((state) => state.addMaterial);
  const updateMaterialRole = useStudioStore(
    (state) => state.updateMaterialRole,
  );
  const updateMaterialKnowledgePoints = useStudioStore(
    (state) => state.updateMaterialKnowledgePoints,
  );
  const updateMaterialNote = useStudioStore(
    (state) => state.updateMaterialNote,
  );
  const removeMaterial = useStudioStore((state) => state.removeMaterial);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);

    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/studio/materials/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("upload_failed");
        }

        const payload = (await response.json()) as MaterialUploadResponse;
        addMaterial({
          id: payload.material.id,
          name: payload.material.name,
          mimeType: payload.material.mimeType,
          size: payload.material.size,
          createdAt: payload.material.createdAt,
          parseSummary: payload.material.parseSummary,
          status: payload.material.status,
          role: payload.material.suggestedRole,
          linkedKnowledgePoints: [],
          note: "",
        });
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium text-primary text-sm">
            <FileStack className="size-4" />
            参考资料池
          </p>
          <h2 className="mt-1 font-semibold text-lg">资料上传与知识点绑定</h2>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={teachingAttachmentAccept}
            multiple
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            上传资料
          </Button>
        </div>
      </div>

      <p className="mt-3 text-muted-foreground text-sm leading-6">
        支持
        PDF、Word、PPT、图片、视频等资料。每份资料都可以标注用途，并绑定到具体知识点或版式要求。
      </p>

      <div className="mt-4 space-y-3">
        {materials.length === 0 ? (
          <div className="rounded-2xl border border-border/70 border-dashed bg-background/65 px-4 py-5 text-muted-foreground text-sm">
            还没有上传参考资料。建议先上传教材截图、教案、案例视频、历年课件或学校统一模板。
          </div>
        ) : (
          materials.map((material) => {
            const roleId = `material-role-${material.id}`;
            const pointsId = `material-points-${material.id}`;
            const noteId = `material-note-${material.id}`;

            return (
              <article
                key={material.id}
                className="rounded-2xl border border-border/60 bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                        {material.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {(material.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground text-sm leading-6">
                      {material.parseSummary}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={() => removeMaterial(material.id)}
                    aria-label={`移除资料 ${material.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                  <label
                    htmlFor={roleId}
                    className="text-muted-foreground text-xs leading-8"
                  >
                    资料用途
                  </label>
                  <select
                    id={roleId}
                    value={material.role}
                    onChange={(event) =>
                      updateMaterialRole(
                        material.id,
                        event.target.value as MaterialRole,
                      )
                    }
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none"
                  >
                    {materialRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <label
                    htmlFor={pointsId}
                    className="flex items-center gap-2 text-muted-foreground text-xs leading-8"
                  >
                    <Link2 className="size-3.5" />
                    对应知识点
                  </label>
                  <Input
                    id={pointsId}
                    value={material.linkedKnowledgePoints.join("、")}
                    onChange={(event) =>
                      updateMaterialKnowledgePoints(
                        material.id,
                        event.target.value
                          .split(/[、,，]/)
                          .map((value) => value.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="例如：导数应用、课堂导入案例、封面视觉"
                  />

                  <label
                    htmlFor={noteId}
                    className="text-muted-foreground text-xs leading-8"
                  >
                    使用说明
                  </label>
                  <textarea
                    id={noteId}
                    value={material.note}
                    onChange={(event) =>
                      updateMaterialNote(material.id, event.target.value)
                    }
                    placeholder="例如：参考该 PDF 第 2 章的例题结构；PPT 配色和版式按这个模板来。"
                    rows={3}
                    className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
