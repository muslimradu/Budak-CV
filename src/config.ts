import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(rootDir, ".env") });

const envSchema = z
  .object({
    TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
    TELEGRAM_USER_ID: z.string().min(1, "TELEGRAM_USER_ID is required"),
    LLM_PROVIDER: z.enum(["claude", "groq"]).default("claude"),
    ANTHROPIC_API_KEY: z.string().optional().default(""),
    ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
    ANTHROPIC_BASE_URL: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.string().url().optional(),
    ),
    GROQ_API_KEY: z.string().optional().default(""),
    GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
    GROQ_VISION_MODEL: z
      .string()
      .default("meta-llama/llama-4-scout-17b-16e-instruct"),
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z
      .string()
      .url()
      .default("http://127.0.0.1:53682/oauth2callback"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
        "DATABASE_URL must be a PostgreSQL connection string",
      ),
    GMAIL_TOKEN_JSON: z.string().optional().default(""),
    MAX_EMAILS_PER_DAY: z.coerce.number().int().positive().default(10),
  })
  .superRefine((data, ctx) => {
    if (data.LLM_PROVIDER === "claude" && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "Required when LLM_PROVIDER=claude",
      });
    }
    if (data.LLM_PROVIDER === "groq" && !data.GROQ_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GROQ_API_KEY"],
        message: "Required when LLM_PROVIDER=groq",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment variables:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
