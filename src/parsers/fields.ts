/** Label -> value slicing shared by the built-in parsers and the learned-rules engine. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits a block into label -> value using the known labels. Longest labels are tried first so
 * "Valor recibido" wins over "Valor". With `requireColon`, a label only counts when followed by ":"
 * (so a merchant called "Hora del cafe" cannot be mistaken for the "Hora" label).
 */
export function readFields(section: string, labels: readonly string[], requireColon: boolean): Map<string, string> {
  const alternation = [...labels].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const re = new RegExp(`(${alternation})${requireColon ? "\\s*:" : "\\s*:?"}`, "gi");
  const hits = [...section.matchAll(re)];
  const fields = new Map<string, string>();
  hits.forEach((hit, i) => {
    const key = hit[1]!.toLowerCase();
    if (fields.has(key)) return;
    const valueStart = hit.index + hit[0].length;
    const valueEnd = hits[i + 1]?.index ?? section.length;
    const value = section.slice(valueStart, valueEnd).replace(/^[\s*:]+|[\s*:]+$/g, "");
    fields.set(key, value);
  });
  return fields;
}

