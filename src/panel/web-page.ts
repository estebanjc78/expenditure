/** Placeholder page; replaced by the real dashboard markup. */
export function renderPage(nonce: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Gastos</title><style nonce="${nonce}">body{font-family:system-ui}</style></head><body><script nonce="${nonce}">document.body.textContent = "ok";</script></body></html>`;
}
