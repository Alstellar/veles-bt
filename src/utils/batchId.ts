export function makeBatchId(): string {
  const timePart = Date.now().toString(16).toUpperCase().slice(-4).padStart(4, '0');

  let randomNibble = Math.floor(Math.random() * 16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    randomNibble = bytes[0] & 0x0f;
  }

  const randomPart = randomNibble.toString(16).toUpperCase();

  return `#${timePart}${randomPart}`;
}
