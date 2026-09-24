import { ConfigError } from './errors';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Read an optional integer config field, clamped to [min, max]. Non-numbers throw ConfigError. */
export function readInt(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConfigError(`config.${key} must be a number`);
  }
  return Math.min(Math.max(Math.round(value), min), max);
}

export function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ConfigError(`config.${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function readString(
  source: Record<string, unknown>,
  key: string,
  fallback: string,
  maxLength: number
): string {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new ConfigError(`config.${key} must be a string`);
  return value.slice(0, maxLength);
}

export function asConfigRecord(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new ConfigError('config must be an object');
  return input;
}
