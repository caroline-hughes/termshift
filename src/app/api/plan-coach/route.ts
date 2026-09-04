import { NextResponse } from "next/server";
import {
	buildPlanCoachPrompt,
	planCoachRequestSchema,
} from "@/lib/extract/plan-coach";
import {
	generateStructured,
	hasOpenAIKey,
	recordExtractionFailure,
} from "@/lib/extract/openai";
import { planCoachSchema } from "@/lib/extract/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function emptyNote() {
	return NextResponse.json({ note: null });
}

export async function POST(request: Request) {
	if (!hasOpenAIKey()) {
		return emptyNote();
	}

	try {
		const body: unknown = await request.json();
		const parsed = planCoachRequestSchema.safeParse(body);

		if (!parsed.success) {
			return emptyNote();
		}

		const { prompt, system } = buildPlanCoachPrompt(parsed.data);
		const result = await generateStructured(planCoachSchema, {
			prompt,
			system,
		});
		const note = result.note.replace(/\s+/g, " ").trim().slice(0, 800);

		return NextResponse.json({ note: note || null });
	} catch (error) {
		recordExtractionFailure(error);
		return emptyNote();
	}
}
