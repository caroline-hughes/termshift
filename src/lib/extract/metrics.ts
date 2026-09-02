export function normalizeEvalValue(value: string) {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function setF1(predicted: string[], gold: string[]) {
	const predictedSet = new Set(predicted.map(normalizeEvalValue));
	const goldSet = new Set(gold.map(normalizeEvalValue));

	if (predictedSet.size === 0 && goldSet.size === 0) {
		return { f1: 1, precision: 1, recall: 1 };
	}

	let overlap = 0;
	for (const item of predictedSet) {
		if (goldSet.has(item)) overlap += 1;
	}

	const precision = predictedSet.size === 0 ? 0 : overlap / predictedSet.size;
	const recall = goldSet.size === 0 ? 0 : overlap / goldSet.size;
	const f1 =
		precision + recall === 0
			? 0
			: (2 * precision * recall) / (precision + recall);

	return { f1, precision, recall };
}

export function scalarScore(predicted: string | undefined, gold: string | undefined) {
	if (!predicted && !gold) return 1;
	return normalizeEvalValue(predicted ?? "") === normalizeEvalValue(gold ?? "")
		? 1
		: 0;
}

export function mean(values: number[]) {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatScore(value: number) {
	return value.toFixed(2);
}
