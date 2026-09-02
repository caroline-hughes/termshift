import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { z } from "zod";

export const EXTRACTION_MODEL = "gpt-4o-mini";

export function getOpenAIApiKey() {
	return (process.env["OPENAI_API_KEY"] ?? "").trim();
}

export function hasOpenAIKey() {
	return Boolean(getOpenAIApiKey());
}

export async function generateStructured<T extends z.ZodType>(
	schema: T,
	options: { prompt: string; system: string },
): Promise<z.infer<T>> {
	const openai = createOpenAI({
		apiKey: getOpenAIApiKey(),
	});

	const { object } = await generateObject({
		abortSignal: AbortSignal.timeout(12_000),
		model: openai(EXTRACTION_MODEL),
		prompt: options.prompt,
		schema,
		system: options.system,
		temperature: 0,
	});

	return object as z.infer<T>;
}
