const ENTITIES: Readonly<Record<string, string>> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]+;|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(p|div|br|li|ul|ol|tr|td|th|table|h[1-6])\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  );
}

/**
 * Turns a mail body (HTML or the markdown-ish plain text) into one line of text:
 * tags, markdown links, table pipes and repeated whitespace are removed.
 */
export function normalizeEmailText(raw: string): string {
  const base = /<\/?[a-z][\s\S]*?>/i.test(raw) ? htmlToText(raw) : raw;
  return base
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
