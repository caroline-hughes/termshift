import { NextResponse } from "next/server";
import { extractJobOpportunity } from "@/lib/extract/job";

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { url?: string };
		const rawUrl = body.url?.trim();

		if (!rawUrl) {
			return NextResponse.json(
				{ error: "Paste a job link to import it." },
				{ status: 400 },
			);
		}

		let parsedUrl: URL;
		try {
			parsedUrl = new URL(rawUrl);
		} catch {
			return NextResponse.json(
				{ error: "That job link does not look valid." },
				{ status: 400 },
			);
		}

		const response = await fetch(parsedUrl.toString(), {
			headers: {
				"accept-language": "en-US,en;q=0.9",
				"user-agent": USER_AGENT,
			},
			redirect: "follow",
		});

		if (!response.ok) {
			const hostname = parsedUrl.hostname.toLowerCase();
			const isIndeed = hostname.includes("indeed.");
			const isLinkedIn = hostname.includes("linkedin.");

			if (response.status === 403 && isIndeed) {
				return NextResponse.json(
					{
						error:
							"Indeed blocked automated access to this posting right now. Try another public Indeed link or test a seeded listing.",
					},
					{ status: 502 },
				);
			}

			if (response.status === 403 && isLinkedIn) {
				return NextResponse.json(
					{
						error:
							"LinkedIn blocked automated access to this posting right now. Try another public LinkedIn link or test a seeded listing.",
					},
					{ status: 502 },
				);
			}

			return NextResponse.json(
				{ error: "TermShift could not open that job posting right now." },
				{ status: 502 },
			);
		}

		const html = await response.text();
		const extracted = await extractJobOpportunity(html, parsedUrl.toString());

		return NextResponse.json({
			extractionNote: extracted.extractionNote,
			extractionSource: extracted.extractionSource,
			opportunity: extracted.opportunity,
		});
	} catch {
		return NextResponse.json(
			{
				error:
					"TermShift could not parse that job link yet. Try a public Indeed or LinkedIn posting.",
			},
			{ status: 500 },
		);
	}
}
