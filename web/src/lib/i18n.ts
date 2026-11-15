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
    review: string;
    contact: string;
    siteBy: string;
    reviewName: string;
    reviewEmail: string;
    reviewMessage: string;
    reviewSubmit: string;
    reviewSending: string;
    reviewSuccess: string;
    reviewError: string;
    artist: string;
    curator: string;
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
    review: "Review",
    contact: "Contact",
    siteBy: "Site by",
    reviewName: "Name",
    reviewEmail: "Email",
    reviewMessage: "Message",
    reviewSubmit: "Send",
    reviewSending: "Sending…",
    reviewSuccess: "Thank you — your review was received.",
    reviewError: "Could not send. Please try again.",
    artist: "Artist",
    curator: "Curator",
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
    review: "Отзыв",
    contact: "Контакт",
    siteBy: "Сайт",
    reviewName: "Имя",
    reviewEmail: "Email",
    reviewMessage: "Сообщение",
    reviewSubmit: "Отправить",
    reviewSending: "Отправка…",
    reviewSuccess: "Спасибо — отзыв получен.",
    reviewError: "Не удалось отправить. Попробуйте ещё раз.",
    artist: "Художник",
    curator: "Куратор",
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
    review: "Відгук",
    contact: "Контакт",
    siteBy: "Сайт",
    reviewName: "Імʼя",
    reviewEmail: "Email",
    reviewMessage: "Повідомлення",
    reviewSubmit: "Надіслати",
    reviewSending: "Надсилання…",
    reviewSuccess: "Дякуємо — відгук отримано.",
    reviewError: "Не вдалося надіслати. Спробуйте ще раз.",
    artist: "Художник",
    curator: "Куратор",
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
    review: "ביקורת",
    contact: "יצירת קשר",
    siteBy: "האתר מאת",
    reviewName: "שם",
    reviewEmail: "אימייל",
    reviewMessage: "הודעה",
    reviewSubmit: "שליחה",
    reviewSending: "שולח…",
    reviewSuccess: "תודה — הביקורת התקבלה.",
    reviewError: "לא ניתן לשלוח. נסו שוב.",
    artist: "אמן",
    curator: "אוצר",
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
