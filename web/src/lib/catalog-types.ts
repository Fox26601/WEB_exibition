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
        en: "A quiet room of light and memory",
        ru: "Тихая комната света и памяти",
        uk: "Тиха кімната світла і памʼяті",
        he: "חדר שקט של אור וזיכרון",
      },
      instagram: "https://instagram.com/",
      email: "hello@example.com",
      bio: {
        en: "Artist bio coming soon.",
        ru: "Биография художника скоро появится.",
        uk: "Біографія художника зʼявиться незабаром.",
        he: "ביוגרפיה של האמן תתווסף בקרוב.",
      },
    },
    artworks: [],
  };
}
