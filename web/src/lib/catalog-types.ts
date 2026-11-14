export const LOCALES = ["en", "ru", "uk", "he"] as const;
export type Locale = (typeof LOCALES)[number];

export type LocalizedString = Record<Locale, string>;

export type ArtworkType = "image" | "video";

export interface Artwork {
  id: string;
  type: ArtworkType;
  sort: number;
  published: boolean;
  title: LocalizedString;
  text: LocalizedString;
  urlWall: string;
  urlFull: string;
  urlVideo: string;
  urlPoster: string;
}

export interface CatalogSettings {
  poster: LocalizedString;
  instagram: string;
  email: string;
  bio: LocalizedString;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  settings: CatalogSettings;
  artworks: Artwork[];
}

export function emptyLocalized(fallback = ""): LocalizedString {
  return { en: fallback, ru: fallback, uk: fallback, he: fallback };
}

export function createDefaultCatalog(): Catalog {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      poster: {
        en: "Sample Exhibition",
        ru: "Пробная выставка",
        uk: "Пробна виставка",
        he: "תערוכת דוגמה",
      },
      instagram: "https://instagram.com/",
      email: "hello@example.com",
      bio: {
        en: "Offline sample catalog for first boot.",
        ru: "Пробный каталог для первого запуска.",
        uk: "Пробний каталог для першого запуску.",
        he: "קטלוג לדוגמה להפעלה ראשונה.",
      },
    },
    artworks: [
  {
    "id": "sample-01",
    "type": "image",
    "sort": 0,
    "published": true,
    "title": {
      "en": "Morning Corridor",
      "ru": "Утренний коридор",
      "uk": "Ранковий коридор",
      "he": "מסדרון בוקר"
    },
    "text": {
      "en": "Placeholder wall piece. Replace via live catalog when the web API is running.",
      "ru": "Заглушка. Заменится живым каталогом при работающем API.",
      "uk": "Заглушка. Заміниться живим каталогом, коли API працює.",
      "he": "יצירת דמה. תוחלף בקטלוג חי כשה-API פעיל."
    },
    "urlWall": "",
    "urlFull": "",
    "urlVideo": "",
    "urlPoster": ""
  },
  {
    "id": "sample-02",
    "type": "image",
    "sort": 1,
    "published": true,
    "title": {
      "en": "Quiet Panel",
      "ru": "Тихая панель",
      "uk": "Тиха панель",
      "he": "לוח שקט"
    },
    "text": {
      "en": "Second sample image slot for alternate-wall layout.",
      "ru": "Второй слот для чередующихся стен.",
      "uk": "Другий слот для чергування стін.",
      "he": "חריץ דוגמה שני לקירות מתחלפים."
    },
    "urlWall": "",
    "urlFull": "",
    "urlVideo": "",
    "urlPoster": ""
  },
  {
    "id": "sample-03",
    "type": "video",
    "sort": 2,
    "published": true,
    "title": {
      "en": "Loop Study",
      "ru": "Этюд цикла",
      "uk": "Етюд циклу",
      "he": "מחקר לולאה"
    },
    "text": {
      "en": "Video slot (headphones marker). Playback uses HTML overlay in WebGL builds.",
      "ru": "Видеослот (маркер наушников). Воспроизведение — HTML-оверлей в WebGL.",
      "uk": "Відеослот (маркер навушників). Відтворення — HTML-оверлей у WebGL.",
      "he": "חריץ וידאו (סמן אוזניות). הנגינה ב-WebGL דרך שכבת HTML."
    },
    "urlWall": "",
    "urlFull": "",
    "urlVideo": "",
    "urlPoster": ""
  },
  {
    "id": "sample-04",
    "type": "image",
    "sort": 3,
    "published": true,
    "title": {
      "en": "North Wall Sketch",
      "ru": "Эскиз северной стены",
      "uk": "Ескіз північної стіни",
      "he": "סקיצה לקיר הצפוני"
    },
    "text": {
      "en": "Fourth sample so the room grows past the empty L0 length.",
      "ru": "Четвёртый образец — комната длиннее пустого L0.",
      "uk": "Четвертий зразок — кімната довша за порожній L0.",
      "he": "דוגמה רביעית כדי שהחדר יגדל מעבר ל-L0 הריק."
    },
    "urlWall": "",
    "urlFull": "",
    "urlVideo": "",
    "urlPoster": ""
  }
] as Artwork[],
  };
}
