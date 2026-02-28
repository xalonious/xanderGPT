import { create, all, type MathJsStatic } from "mathjs";

const math = create(all, {
  number: "number",
  precision: 64,
}) as MathJsStatic;

math.import(
  {
    import: () => {
      throw new Error("import is disabled");
    },
    createUnit: () => {
      throw new Error("units are disabled");
    },
    evaluate: () => {
      throw new Error("nested evaluate is disabled");
    },
    parse: () => {
      throw new Error("parse is disabled");
    },
    simplify: () => {
      throw new Error("simplify is disabled");
    },
    derivative: () => {
      throw new Error("derivative is disabled");
    },
  },
  { override: true }
);

function validateExpression(expr: string) {
  const s = expr.trim();
  if (!s) throw new Error("Empty expression");
  if (s.length > 240) throw new Error("Expression too long");

  if (/[=;[\].{}]/.test(s)) throw new Error("Unsupported syntax");

  if (!/^[0-9+\-*/^().,\sA-Za-z_]+$/.test(s)) {
    throw new Error("Invalid characters");
  }
}

export function evaluateExpression(expr: string): number {
  validateExpression(expr);

  const result = math.evaluate(expr, {});

  const value =
    typeof result === "number"
      ? result
      : typeof (result as any)?.valueOf === "function"
        ? Number((result as any).valueOf())
        : Number(result);

  if (!Number.isFinite(value)) throw new Error("Result is not finite");
  return value;
}