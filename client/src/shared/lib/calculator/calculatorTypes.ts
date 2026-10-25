export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export type CalculatorResult = {
  ok: true;
  value: string;
  approximate: boolean;
} | {
  ok: false;
  error: string;
};
