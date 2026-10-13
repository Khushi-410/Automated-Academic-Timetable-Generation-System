export const createId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
