import { LOCALES, type Lang } from "@/i18n/lang";

// Picks the form for a count with the language's plural rules: Polish has one / few / many / other
// (1; 2-4 and 22-24; 0, 5-21 and 25+; fractions), English one / other. `other` is the required fallback.
export function plural<T>(lang: Lang, count: number, forms: Partial<Record<Intl.LDMLPluralRule, T>> & { other: T }): T {
  const category = new Intl.PluralRules(LOCALES[lang]).select(count);
  return forms[category] ?? forms.other;
}
