function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => normalize(item));

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes('token') ||
      lowered.includes('authorization') ||
      lowered.includes('cookie') ||
      lowered.includes('csrf') ||
      lowered.includes('password')
    ) {
      result[key] = '[masked]';
      continue;
    }
    result[key] = normalize(obj[key]);
  }

  return result;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function configHash(value: unknown): string {
  try {
    const normalized = normalize(value);
    return hashString(JSON.stringify(normalized));
  } catch {
    return 'hash_error';
  }
}
