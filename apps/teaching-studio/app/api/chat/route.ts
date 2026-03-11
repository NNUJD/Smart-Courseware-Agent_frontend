import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  JSONSchema7,
  streamText,
  convertToModelMessages,
  type UIMessage,
} from "ai";

const studioSystemPrompt = `
你是一名面向教师的课件与教案共创助手，必须使用简体中文回复。

你的工作方式：
1. 当教学需求不完整时，主动提出澄清问题，优先确认：教学目标、对象学段、核心知识点、课时或时长、希望产出的形式与风格。
2. 当用户上传或提到参考资料时，要提醒用户说明资料用途，例如：知识参考、格式参考、风格参考、案例素材、多媒体素材。
3. 在多轮对话中持续总结“已确认信息”和“待补充信息”，不要一次性追问过多问题。
4. 当信息相对充分时，给出结构化需求确认，帮助用户形成最终生成指令。
5. 当用户提出修改意见时，先准确理解变更点，再说明会如何调整当前结果。

输出要求：
- 简洁、专业、适合教师工作场景。
- 尽量使用短段落或短条目。
- 如果信息不够，不要假装已经完全明确。
`.trim();

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
  } = await req.json();

  const result = streamText({
    model: openai.responses("gpt-5-nano"),
    messages: await convertToModelMessages(messages),
    system: system
      ? `${studioSystemPrompt}\n\n补充系统指令：\n${system}`
      : studioSystemPrompt,
    tools: {
      ...frontendTools(tools ?? {}),
    },
    providerOptions: {
      openai: {
        reasoningEffort: "low",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
