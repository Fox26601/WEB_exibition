export const LOCALES = ["en", "ru", "uk", "he"] as const;
export type Locale = (typeof LOCALES)[number];

export type LocalizedString = Record<Locale, string>;

export type ArtworkType = "image" | "video" | "model";

export type RoomShape = "triangle" | "square" | "pentagon" | "hexagon";

export type FrameId = "thin" | "wood" | "metal" | "ornate" | "none";

export type PlacementKind = "painting" | "sculpture";

export const FRAME_IDS: FrameId[] = [
  "thin",
  "wood",
  "metal",
  "ornate",
  "none",
];

export const ROOM_SHAPES: RoomShape[] = [
  "triangle",
  "square",
  "pentagon",
  "hexagon",
];

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
  /** GLB / glTF URL for sculptures (type === "model"). */
  modelUrl?: string;
  /** Default frame when placed as a painting. */
  frameId?: FrameId;
}

export interface RoomTransform {
  x: number;
  z: number;
  /** Degrees, Y-up world. */
  rotation: number;
  scaleX: number;
  scaleZ: number;
}

export interface GalleryRoom {
  id: string;
  shape: RoomShape;
  transform: RoomTransform;
  /** Optional world-space override; otherwise derived from shape + transform. */
  vertices?: { x: number; z: number }[];
}

export interface RoomConnection {
  roomA: string;
  roomB: string;
  edgeA: number;
  edgeB: number;
  doorwayWidth: number;
}

/** Normalized hang height on wall (world Y = wallHeightT × room height). */
export const DEFAULT_WALL_HEIGHT_T = 0.55;
export const MIN_WALL_HEIGHT_T = 0.15;
export const MAX_WALL_HEIGHT_T = 0.9;

export interface ArtworkPlacement {
  artworkId: string;
  kind: PlacementKind;
  roomId: string;
  wallEdgeIndex?: number;
  /** 0..1 along the wall edge. */
  tAlongEdge?: number;
  /** 0..1 up the wall (visitor Y). Omitted / legacy → DEFAULT_WALL_HEIGHT_T. */
  wallHeightT?: number;
  floorX?: number;
  floorZ?: number;
  yaw: number;
  frameId: FrameId;
}

/** Always-on schematic entrance block (pose only; content stays in settings.entrance). */
export interface GalleryEntrancePose {
  x: number;
  z: number;
  /** Degrees, Y-up world. */
  rotation: number;
}

/** Synthetic room id for soft-snap / doorway connections to the entrance portal. */
export const ENTRANCE_ROOM_ID = "__entrance";

export const DEFAULT_ENTRANCE_POSE: GalleryEntrancePose = {
  x: 0,
  z: -2,
  rotation: 0,
};

export interface GalleryLayout {
  rooms: GalleryRoom[];
  connections: RoomConnection[];
  placements: ArtworkPlacement[];
  /** Fixed-size entrance portal block; always present after normalize. */
  entrance: GalleryEntrancePose;
}

export interface BookletPage {
  /** "intro", layout room id, or "hall-1"… for rect fallback. */
  key: string;
  title: LocalizedString;
  body: LocalizedString;
}

export interface EntranceSettings {
  posterUrl: string;
  booklet: BookletPage[];
}

export interface DonateSettings {
  text: LocalizedString;
  url: string;
}

export interface CatalogSettings {
  poster: LocalizedString;
  instagram: string;
  email: string;
  bio: LocalizedString;
  entrance: EntranceSettings;
  aboutArtist: LocalizedString;
  aboutCurator: LocalizedString;
  donate: DonateSettings;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  settings: CatalogSettings;
  artworks: Artwork[];
  /** Empty / missing → rect L/R fallback for wall placement. */
  layout?: GalleryLayout;
}

export function emptyLocalized(fallback = ""): LocalizedString {
  return { en: fallback, ru: fallback, uk: fallback, he: fallback };
}

export function emptyBookletPage(key: string): BookletPage {
  return {
    key,
    title: emptyLocalized(key === "intro" ? "Exhibition" : key),
    body: emptyLocalized(),
  };
}

export function emptyEntrance(): EntranceSettings {
  return {
    posterUrl: "",
    booklet: [emptyBookletPage("intro")],
  };
}

export function emptyDonate(): DonateSettings {
  return { text: emptyLocalized(), url: "" };
}

export function normalizeLocalized(
  value?: Partial<LocalizedString> | null,
  fallback = "",
): LocalizedString {
  return {
    en: value?.en ?? fallback,
    ru: value?.ru ?? fallback,
    uk: value?.uk ?? fallback,
    he: value?.he ?? fallback,
  };
}

export function normalizeEntrance(
  entrance?: Partial<EntranceSettings> | null,
): EntranceSettings {
  const booklet = Array.isArray(entrance?.booklet)
    ? entrance!.booklet.map((page, i) => ({
        key: page?.key || (i === 0 ? "intro" : `hall-${i}`),
        title: normalizeLocalized(page?.title),
        body: normalizeLocalized(page?.body),
      }))
    : [];
  if (booklet.length === 0) booklet.push(emptyBookletPage("intro"));
  return {
    posterUrl: entrance?.posterUrl ?? "",
    booklet,
  };
}

export function normalizeDonate(
  donate?: Partial<DonateSettings> | null,
): DonateSettings {
  return {
    text: normalizeLocalized(donate?.text),
    url: donate?.url ?? "",
  };
}

export function normalizeSettings(
  settings?: Partial<CatalogSettings> | null,
): CatalogSettings {
  return {
    poster: normalizeLocalized(settings?.poster, "Exhibition"),
    instagram: settings?.instagram ?? "",
    email: settings?.email ?? "",
    bio: normalizeLocalized(settings?.bio),
    entrance: normalizeEntrance(settings?.entrance),
    aboutArtist: normalizeLocalized(settings?.aboutArtist),
    aboutCurator: normalizeLocalized(settings?.aboutCurator),
    donate: normalizeDonate(settings?.donate),
  };
}

export function emptyLayout(): GalleryLayout {
  return {
    rooms: [],
    connections: [],
    placements: [],
    entrance: { ...DEFAULT_ENTRANCE_POSE },
  };
}

export function normalizeEntrancePose(
  entrance?: Partial<GalleryEntrancePose> | null,
): GalleryEntrancePose {
  return {
    x: typeof entrance?.x === "number" && Number.isFinite(entrance.x)
      ? entrance.x
      : DEFAULT_ENTRANCE_POSE.x,
    z: typeof entrance?.z === "number" && Number.isFinite(entrance.z)
      ? entrance.z
      : DEFAULT_ENTRANCE_POSE.z,
    rotation:
      typeof entrance?.rotation === "number" && Number.isFinite(entrance.rotation)
        ? entrance.rotation
        : DEFAULT_ENTRANCE_POSE.rotation,
  };
}

export function normalizeLayout(layout?: GalleryLayout | null): GalleryLayout {
  if (!layout) return emptyLayout();
  const rooms = (Array.isArray(layout.rooms) ? layout.rooms : []).filter(
    (r) => r && r.id !== ENTRANCE_ROOM_ID,
  );
  return {
    rooms,
    connections: Array.isArray(layout.connections) ? layout.connections : [],
    placements: Array.isArray(layout.placements) ? layout.placements : [],
    entrance: normalizeEntrancePose(layout.entrance),
  };
}

export function layoutIsEmpty(layout?: GalleryLayout | null): boolean {
  const n = normalizeLayout(layout);
  return n.rooms.length === 0;
}

/** Seed sample wall textures under public/samples. */
const SAMPLE = {
  "01": "/samples/sample-01.jpg",
  "02": "/samples/sample-02.jpg",
  "03": "/samples/sample-03.jpg",
  "04": "/samples/sample-04.jpg",
} as const;

const SCULPTURE_SAMPLES = [
  {
    id: "sample-sculpture-box",
    modelUrl: "/samples/sculptures/box.glb",
    title: {
      en: "Stub Box",
      ru: "Короб-заглушка",
      uk: "Короб-заглушка",
      he: "קופסת דמה",
    },
    text: {
      en: "Low-poly GLB stub for sculpture floor placement tests.",
      ru: "Низкополигональный GLB для теста скульптур на полу.",
      uk: "Низькополігональний GLB для тесту скульптур на підлозі.",
      he: "מודל GLB פשוט לבדיקת פסלים על הרצפה.",
    },
  },
  {
    id: "sample-sculpture-obelisk",
    modelUrl: "/samples/sculptures/obelisk.glb",
    title: {
      en: "Stub Obelisk",
      ru: "Обелиск-заглушка",
      uk: "Обеліск-заглушка",
      he: "אובליסק דמה",
    },
    text: {
      en: "Tall stub sculpture for floor snap occupancy checks.",
      ru: "Высокая заглушка для проверки занятости пола.",
      uk: "Висока заглушка для перевірки зайнятості підлоги.",
      he: "פסל גבוה לבדיקת תפוסת רצפה.",
    },
  },
  {
    id: "sample-sculpture-plinth",
    modelUrl: "/samples/sculptures/plinth.glb",
    title: {
      en: "Stub Plinth",
      ru: "Пьедестал-заглушка",
      uk: "П'єдестал-заглушка",
      he: "בסיס דמה",
    },
    text: {
      en: "Wide plinth stub for sculpture spacing.",
      ru: "Широкий пьедестал для интервалов скульптур.",
      uk: "Широкий п'єдестал для інтервалів скульптур.",
      he: "בסיס רחב למרווחי פסלים.",
    },
  },
] as const;

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
      entrance: {
        posterUrl: "/samples/sample-01.jpg",
        booklet: [
          {
            key: "intro",
            title: {
              en: "Welcome",
              ru: "Добро пожаловать",
              uk: "Ласкаво просимо",
              he: "ברוכים הבאים",
            },
            body: {
              en: "Pick up the booklet at the entrance pedestal. Press Q (or Map on mobile) to open it.",
              ru: "Возьмите буклет у пьедестала у входа. Q (или Map на мобильном) открывает его.",
              uk: "Візьміть буклет біля п'єдесталу. Q (або Map на мобільному) відкриває його.",
              he: "קחו את החוברת מהכן בכניסה. Q (או Map במובייל) פותח אותה.",
            },
          },
          {
            key: "hall-1",
            title: {
              en: "Main hall",
              ru: "Главный зал",
              uk: "Головна зала",
              he: "האולם הראשי",
            },
            body: {
              en: "Works hang along the corridor walls beyond the arch.",
              ru: "Работы на стенах коридора за аркой.",
              uk: "Роботи на стінах коридору за аркою.",
              he: "היצירות על קירות המסדרון מעבר לקשת.",
            },
          },
        ],
      },
      aboutArtist: {
        en: "About the artist — edit in admin settings.",
        ru: "Об художнике — редактируется в админке.",
        uk: "Про художника — редагується в адмінці.",
        he: "על האמן — ניתן לערוך בהגדרות.",
      },
      aboutCurator: {
        en: "About the curator — edit in admin settings.",
        ru: "О кураторе — редактируется в админке.",
        uk: "Про куратора — редагується в адмінці.",
        he: "על האוצר — ניתן לערוך בהגדרות.",
      },
      donate: {
        text: {
          en: "Support the exhibition.",
          ru: "Поддержите выставку.",
          uk: "Підтримайте виставку.",
          he: "תמכו בתערוכה.",
        },
        url: "",
      },
    },
    layout: emptyLayout(),
    artworks: [
      {
        id: "sample-01",
        type: "image",
        sort: 0,
        published: true,
        title: {
          en: "Morning Corridor",
          ru: "Утренний коридор",
          uk: "Ранковий коридор",
          he: "מסדרון בוקר",
        },
        text: {
          en: "Placeholder wall piece. Replace via live catalog when the web API is running.",
          ru: "Заглушка. Заменится живым каталогом при работающем API.",
          uk: "Заглушка. Заміниться живим каталогом, коли API працює.",
          he: "יצירת דמה. תוחלף בקטלוג חי כשה-API פעיל.",
        },
        urlWall: SAMPLE["01"],
        urlFull: SAMPLE["01"],
        urlVideo: "",
        urlPoster: "",
        frameId: "wood",
      },
      {
        id: "sample-02",
        type: "image",
        sort: 1,
        published: true,
        title: {
          en: "Quiet Panel",
          ru: "Тихая панель",
          uk: "Тиха панель",
          he: "לוח שקט",
        },
        text: {
          en: "Second sample image slot for alternate-wall layout.",
          ru: "Второй слот для чередующихся стен.",
          uk: "Другий слот для чергування стін.",
          he: "חריץ דוגמה שני לקירות מתחלפים.",
        },
        urlWall: SAMPLE["02"],
        urlFull: SAMPLE["02"],
        urlVideo: "",
        urlPoster: "",
        frameId: "thin",
      },
      {
        id: "sample-03",
        type: "video",
        sort: 2,
        published: true,
        title: {
          en: "Loop Study",
          ru: "Этюд цикла",
          uk: "Етюд циклу",
          he: "מחקר לולאה",
        },
        text: {
          en: "Video slot (headphones marker). Playback uses HTML overlay in WebGL builds.",
          ru: "Видеослот (маркер наушников). Воспроизведение — HTML-оверлей в WebGL.",
          uk: "Відеослот (маркер навушників). Відтворення — HTML-оверлей у WebGL.",
          he: "חריץ וידאו (סמן אוזניות). הנגינה ב-WebGL דרך שכבת HTML.",
        },
        urlWall: SAMPLE["03"],
        urlFull: SAMPLE["03"],
        urlVideo: "",
        urlPoster: SAMPLE["03"],
        frameId: "metal",
      },
      {
        id: "sample-04",
        type: "image",
        sort: 3,
        published: true,
        title: {
          en: "North Wall Sketch",
          ru: "Эскиз северной стены",
          uk: "Ескіз північної стіни",
          he: "סקיצה לקיר הצפוני",
        },
        text: {
          en: "Fourth sample so the room grows past the empty L0 length.",
          ru: "Четвёртый образец — комната длиннее пустого L0.",
          uk: "Четвертий зразок — кімната довша за порожній L0.",
          he: "דוגמה רביעית כדי שהחדר יגדל מעבר ל-L0 הריק.",
        },
        urlWall: SAMPLE["04"],
        urlFull: SAMPLE["04"],
        urlVideo: "",
        urlPoster: "",
        frameId: "ornate",
      },
      ...SCULPTURE_SAMPLES.map((s, i) => ({
        id: s.id,
        type: "model" as const,
        sort: 4 + i,
        published: true,
        title: { ...s.title },
        text: { ...s.text },
        urlWall: "",
        urlFull: "",
        urlVideo: "",
        urlPoster: "",
        modelUrl: s.modelUrl,
        frameId: "none" as const,
      })),
    ],
  };
}
