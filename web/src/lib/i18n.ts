import type { Locale, LocalizedString } from "./catalog-types";
import { LOCALES } from "./catalog-types";

export { LOCALES };
export type { Locale };

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  ru: "RU",
  uk: "UK",
  he: "HE",
};

export const UI: Record<
  Locale,
  {
    enter: string;
    bio: string;
    instagram: string;
    email: string;
    exit: string;
    info: string;
    close: string;
    lang: string;
    exhibition: string;
    emptyRoom: string;
    onlineGallery: string;
    aboutArtist: string;
    aboutCurator: string;
    donate: string;
    links: string;
    map: string;
  }
> = {
  en: {
    enter: "Enter exhibition",
    bio: "Bio / CV",
    instagram: "Instagram",
    email: "Email",
    exit: "Exit",
    info: "Info",
    close: "Close",
    lang: "Language",
    exhibition: "Exhibition",
    emptyRoom: "The gallery awaits its first works.",
    onlineGallery: "Online gallery",
    aboutArtist: "About artist",
    aboutCurator: "About curator",
    donate: "Donate",
    links: "Links",
    map: "Map",
  },
  ru: {
    enter: "Войти в выставку",
    bio: "Био / CV",
    instagram: "Instagram",
    email: "Email",
    exit: "Выход",
    info: "Инфо",
    close: "Закрыть",
    lang: "Язык",
    exhibition: "Выставка",
    emptyRoom: "Галерея ждёт первых работ.",
    onlineGallery: "Онлайн-галерея",
    aboutArtist: "Об художнике",
    aboutCurator: "О кураторе",
    donate: "Донат",
    links: "Ссылки",
    map: "Карта",
  },
  uk: {
    enter: "Увійти на виставку",
    bio: "Біо / CV",
    instagram: "Instagram",
    email: "Email",
    exit: "Вихід",
    info: "Інфо",
    close: "Закрити",
    lang: "Мова",
    exhibition: "Виставка",
    emptyRoom: "Галерея чекає на перші роботи.",
    onlineGallery: "Онлайн-галерея",
    aboutArtist: "Про художника",
    aboutCurator: "Про куратора",
    donate: "Донат",
    links: "Посилання",
    map: "Мапа",
  },
  he: {
    enter: "כניסה לתערוכה",
    bio: "ביו / קו״ח",
    instagram: "אינסטגרם",
    email: "אימייל",
    exit: "יציאה",
    info: "מידע",
    close: "סגור",
    lang: "שפה",
    exhibition: "תערוכה",
    emptyRoom: "הגלריה ממתינה ליצירות הראשונות.",
    onlineGallery: "גלריה מקוונת",
    aboutArtist: "על האמן",
    aboutCurator: "על האוצר",
    donate: "תרומה",
    links: "קישורים",
    map: "מפה",
  },
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function pickLocalized(
  map: LocalizedString | undefined,
  locale: Locale,
): string {
  if (!map) return "";
  return map[locale] || map.en || "";
}

export function direction(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}
