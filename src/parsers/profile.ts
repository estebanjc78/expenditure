import { z } from "zod";
import { assertRegexUsable } from "./safe-regex.js";
import { DATE_FORMATS } from "./date.js";

/** Where a value comes from: the text after a label, the first capture group of a regex, or a fixed string. */
const extractor = z.union([
  z.object({ label: z.string().trim().min(1).max(60) }).strict(),
  z.object({ regex: z.string().min(1).max(200) }).strict().superRefine((v, ctx) => {
    try {
      assertRegexUsable(v.regex);
    } catch (err) {
      ctx.addIssue({ code: "custom", message: err instanceof Error ? err.message : String(err) });
    }
  }),
  z.object({ fixed: z.string().trim().min(1).max(60) }).strict(),
]);

const textList = z.array(z.string().trim().min(1).max(80)).max(8);

const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    /** The template applies when the subject contains ANY of `subjectContains` (if given) and the text contains ALL of `bodyContains` (if given). */
    subjectContains: textList.optional(),
    bodyContains: textList.optional(),
    action: z.enum(["register", "skip"]).default("register"),
    skipReason: z.string().trim().max(100).optional(),
    kind: z.enum(["gasto", "ingreso", "transferencia_propia"]).optional(),
    amount: extractor.optional(),
    merchant: extractor.optional(),
    /** Optional: when missing, the mail's own date (in the profile's time zone) is used. */
    date: extractor.optional(),
    /** Other labels that appear in the notice, so a value stops where the next label starts. */
    delimiters: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    /** Text after which the notice is only legal boilerplate. */
    endMarkers: textList.optional(),
  })
  .superRefine((t, ctx) => {
    if (!t.subjectContains?.length && !t.bodyContains?.length) {
      ctx.addIssue({ code: "custom", message: `template "${t.name}": give subjectContains and/or bodyContains so it knows which mails it applies to` });
    }
    if (t.action === "register") {
      for (const key of ["kind", "amount", "merchant"] as const) {
        if (!t[key]) ctx.addIssue({ code: "custom", message: `template "${t.name}": "${key}" is required when action is register` });
      }
    }
  });

export const profileSchema = z.object({
  /** Short lowercase bank name stored with every movement, e.g. "galicia". */
  bank: z.string().trim().toLowerCase().min(2).max(30),
  /** Currency of the amounts in this bank's notices (ISO 4217). Amounts in another currency are reported, not registered. */
  currency: z.string().trim().toUpperCase().length(3).default("COP"),
  /** IANA time zone used to date a movement by the mail's date when the notice has none. */
  timezone: z.string().trim().min(3).max(60).default("America/Bogota"),
  /** Date formats found in the notices, tried in order. */
  dateFormats: z.array(z.enum(DATE_FORMATS)).min(1).max(4).default(["YYYY-MM-DD"]),
  endMarkers: textList.default([]),
  templates: z.array(templateSchema).min(1).max(20),
});

export type BankProfile = z.infer<typeof profileSchema>;
export type ProfileTemplate = z.infer<typeof templateSchema>;
export type Extractor = z.infer<typeof extractor>;
