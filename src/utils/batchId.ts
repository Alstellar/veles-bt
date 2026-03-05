export function makeBatchId(): string {
  const timePart = Date.now().toString(16).toUpperCase();
  const randomPart = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');

  return `#${timePart}${randomPart}`;
}
