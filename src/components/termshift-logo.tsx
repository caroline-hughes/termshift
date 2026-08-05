import type { CSSProperties } from "react";

type TermShiftLogoProps = {
	className?: string;
	size?: number;
};

type SquareProps = {
	column: number;
	row: number;
};

export function TermShiftLogo({
	size,
	className = "",
}: TermShiftLogoProps) {
	const style = size
		? ({
				"--ts-gap": `${(size / 5.5) * 0.35}px`,
				"--ts-square": `${size / 5.5}px`,
		  } as CSSProperties)
		: undefined;

	return (
		<div
			className={`termshift-logo ${className}`.trim()}
			style={style}
			role="img"
			aria-label="TermShift"
		>
			<Square row={1} column={1} />
			<span
				className="termshift-logo__word"
				style={{ gridColumn: "2 / span 2", gridRow: 1 }}
				aria-hidden="true"
			>
				term
			</span>
			<Square row={1} column={4} />
			<Square row={1} column={5} />

			<Square row={2} column={1} />
			<Square row={2} column={2} />
			<span
				className="termshift-logo__word"
				style={{ gridColumn: "3 / span 2", gridRow: 2 }}
				aria-hidden="true"
			>
				shift
			</span>
			<Square row={2} column={5} />

			<Square row={3} column={1} />
			<Square row={3} column={2} />
			<Square row={3} column={3} />
			<Square row={3} column={4} />
			<Square row={3} column={5} />
		</div>
	);
}

function Square({ row, column }: SquareProps) {
	return (
		<span
			className="termshift-logo__square"
			style={{ gridColumn: column, gridRow: row }}
			aria-hidden="true"
		/>
	);
}
