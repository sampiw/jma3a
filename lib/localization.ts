import darija from "@/locales/darija.json";
import ar from "@/locales/ar.json";
import fr from "@/locales/fr.json";
import en from "@/locales/en.json";

export type Locale = "darija" | "ar" | "fr" | "en";

export const LOCALES: Record<Locale, typeof darija> = {
  darija,
  ar,
  fr,
  en,
};

export function getDictionary(locale: Locale = "darija") {
  return LOCALES[locale] || LOCALES.darija;
}

export function isRTL(locale: Locale = "darija"): boolean {
  return locale === "darija" || locale === "ar";
}
