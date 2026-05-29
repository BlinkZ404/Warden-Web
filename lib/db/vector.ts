/** Format a number[] as a pgvector literal: [0.1,0.2,...]. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Parse a pgvector literal string back into a number[]. */
export function fromVectorLiteral(literal: string | null): number[] | null {
  if (!literal) return null;
  return literal
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(Number);
}
