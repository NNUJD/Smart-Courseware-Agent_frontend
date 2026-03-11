export async function POST(request: Request) {
  const payload = await request.json();
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "teaching-studio-placeholder-export",
      note: "后端接入完成后，可在此导出 pptx、docx、html5、gif、mp4 或打包 zip。",
      payload,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="teaching-studio-export.json"',
    },
  });
}
