import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "../config.js";

let anthropicClient: Anthropic | null = null;
let groqClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(env.ANTHROPIC_BASE_URL
        ? { baseURL: env.ANTHROPIC_BASE_URL }
        : {}),
    });
  }
  return anthropicClient;
}

function getGroqClient(): OpenAI {
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export type ImageInput = {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  dataBase64: string;
};

async function chatJsonClaude(
  system: string,
  user: string,
  image?: ImageInput,
): Promise<string> {
  const client = getAnthropicClient();
  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] =
    image
      ? [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.dataBase64,
            },
          },
          {
            type: "text",
            text: `${user}\n\nRespond with a single valid JSON object only.`,
          },
        ]
      : `${user}\n\nRespond with a single valid JSON object only.`;

  try {
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      system: `${system}\n\nRespond with a single valid JSON object only. No markdown.`,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) throw new Error("Claude returned empty response");
    return extractJsonObject(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      throw new Error(
        "Rate limit / kuota Claude. Tunggu sebentar, atau sementara LLM_PROVIDER=groq. " +
          msg.slice(0, 200),
      );
    }
    throw error;
  }
}

async function chatJsonGroq(
  system: string,
  user: string,
  image?: ImageInput,
): Promise<string> {
  const client = getGroqClient();
  const model = image ? env.GROQ_VISION_MODEL : env.GROQ_MODEL;

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = image
    ? [
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mediaType};base64,${image.dataBase64}`,
          },
        },
        {
          type: "text",
          text: `${user}\n\nRespond with a single valid JSON object only.`,
        },
      ]
    : [
        {
          type: "text",
          text: `${user}\n\nRespond with a single valid JSON object only.`,
        },
      ];

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Groq returned empty response");
    return extractJsonObject(text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
      throw new Error(
        "Rate limit Groq. Tunggu sebentar atau ganti model. " + msg.slice(0, 200),
      );
    }
    throw error;
  }
}

export async function chatJson(
  system: string,
  user: string,
  image?: ImageInput,
): Promise<string> {
  if (env.LLM_PROVIDER === "groq") {
    return chatJsonGroq(system, user, image);
  }
  return chatJsonClaude(system, user, image);
}
