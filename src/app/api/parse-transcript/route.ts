import { NextResponse } from "next/server";
import { extractTranscriptProfile } from "@/lib/extract/transcript";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			fileName?: string;
			text?: string;
		};
		const text = body.text?.trim();
		const fileName = body.fileName?.trim() || "upload.pdf";

		if (!text) {
			return NextResponse.json(
				{ error: "TermShift needs extracted transcript text to continue." },
				{ status: 400 },
			);
		}

		const extracted = await extractTranscriptProfile(text, fileName);

		return NextResponse.json({
			extractionNote: extracted.extractionNote,
			extractionSource: extracted.extractionSource,
			profile: extracted.profile,
			remainingRequirements: extracted.remainingRequirements,
		});
	} catch {
		return NextResponse.json(
			{
				error:
					"TermShift could not extract that transcript yet. The local parser will be used if you retry.",
			},
			{ status: 500 },
		);
	}
}
