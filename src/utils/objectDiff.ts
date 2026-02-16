export interface DiffEntry {
  path: string;
  before: unknown;
  after: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinPath(base: string, next: string): string {
  if (!base) return next;
  if (next.startsWith('[')) return `${base}${next}`;
  return `${base}.${next}`;
}

export function getObjectDiff(
  beforeValue: unknown,
  afterValue: unknown,
  maxEntries = 30
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  const walk = (beforeNode: unknown, afterNode: unknown, path: string) => {
    if (diffs.length >= maxEntries) return;

    if (Object.is(beforeNode, afterNode)) return;

    if (Array.isArray(beforeNode) && Array.isArray(afterNode)) {
      if (beforeNode.length !== afterNode.length) {
        diffs.push({
          path: path || 'root',
          before: beforeNode,
          after: afterNode
        });
        return;
      }
      for (let i = 0; i < beforeNode.length; i++) {
        walk(beforeNode[i], afterNode[i], joinPath(path, `[${i}]`));
        if (diffs.length >= maxEntries) return;
      }
      return;
    }

    if (isObject(beforeNode) && isObject(afterNode)) {
      const keys = new Set([...Object.keys(beforeNode), ...Object.keys(afterNode)]);
      for (const key of keys) {
        walk(beforeNode[key], afterNode[key], joinPath(path, key));
        if (diffs.length >= maxEntries) return;
      }
      return;
    }

    diffs.push({
      path: path || 'root',
      before: beforeNode,
      after: afterNode
    });
  };

  walk(beforeValue, afterValue, '');
  return diffs;
}
