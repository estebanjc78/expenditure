/** Mail bodies are untrusted input: cap the size and keep every scan linear (no backtracking-prone regexes). */
export const MAX_BODY_CHARS = 200_000;
const MAX_TAG_CHARS = 500;
const SKIPPED_BLOCKS = new Set(["style", "script", "head"]);
const BLOCK_TAGS = new Set(["p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "table", "h1", "h2", "h3", "h4", "h5", "h6"]);

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

function codePointToString(n: number): string {
  const valid = n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
  return valid ? String.fromCodePoint(n) : " ";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&[a-z]{2,8};|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/&#(\d{1,10});/g, (_, n: string) => codePointToString(Number(n)));
}

/** Single pass over the HTML: drops tags and style/script/head blocks, separates block tags with a space. */
function htmlToText(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    const gtInWindow = html.slice(lt, lt + MAX_TAG_CHARS + 1).indexOf(">");
    if (gtInWindow === -1) {
      out.push("<");
      i = lt + 1;
      continue;
    }
    const gt = lt + gtInWindow;
    const tag = lower.slice(lt + 1, gt);
    const closing = tag.startsWith("/");
    const name = /^\/?([a-z0-9]+)/.exec(tag)?.[1];
    if (name && !closing && SKIPPED_BLOCKS.has(name)) {
      const close = lower.indexOf(`</${name}`, gt);
      if (close === -1) break; // unclosed block: everything after it is dropped
      const end = html.indexOf(">", close);
      out.push(" ");
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (name && BLOCK_TAGS.has(name)) out.push(" ");
    i = gt + 1;
  }
  return decodeEntities(out.join(""));
}

const LOOKS_LIKE_HTML = /<\/?[a-z][^>]{0,500}>/i;

/**
 * Turns a mail body (HTML or the markdown-ish plain text) into one line of text:
 * tags, markdown links, table pipes and repeated whitespace are removed.
 */
export function normalizeEmailText(raw: string): string {
  const capped = raw.length > MAX_BODY_CHARS ? raw.slice(0, MAX_BODY_CHARS) : raw;
  const base = LOOKS_LIKE_HTML.test(capped) ? htmlToText(capped) : capped;
  return base
    .replace(/\[([^\]]{0,200})\]\([^)]{0,500}\)/g, "$1")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
