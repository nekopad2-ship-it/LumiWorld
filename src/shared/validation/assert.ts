export function assertRecord(
  value: unknown,
  context: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
}

export function assertString(
  value: unknown,
  context: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
}

export function assertNumber(
  value: unknown,
  context: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number`);
  }
}

export function assertBoolean(
  value: unknown,
  context: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean`);
  }
}

export function assertArray(
  value: unknown,
  context: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
}
