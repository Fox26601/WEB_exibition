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
    view: string;
    booklet: string;
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
    view: "View",
    booklet: "Booklet",
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
    view: "Смотреть",
    booklet: "Буклет",
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
    view: "Дивитись",
    booklet: "Буклет",
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
    view: "צפייה",
    booklet: "חוברת",
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

export type AdminEditorStrings = {
  roomPlanTitle: string;
  planMode: string;
  placeMode: string;
  deleteRoom: string;
  rotateFigure: string;
  surfaces: string;
  floor: string;
  walls: string;
  addRoom: string;
  autosaveSaving: string;
  autosaveSaved: string;
  autosaveFailed: string;
  retry: string;
  placeBanner: string;
  entranceHelp: string;
  entranceHelpBody: string;
  entranceHelpPlaceDrag: string;
  entranceHelpRoomsMeta: string;
  entranceHelpAddRoom: string;
  entranceLabel: string;
  dropNoSnap: string;
  dropConflict: string;
  dropOutside: string;
  placeOnPlan: string;
  placeInstructions: string;
  frame: string;
  remove: string;
  removeFromPlan: string;
  painting: string;
  sculpture: string;
  publishArtworksFirst: string;
  emptyPlacePalette: string;
  unpublishedBadge: string;
  untitled: string;
  publishToLive: string;
  openDraft3d: string;
  openLive3d: string;
  artworksPlaceHint: string;
  draftAutosaveIntro: string;
  lastLivePublish: string;
  unpublishedDraft: string;
  liveMatchesDraft: string;
  publishLiveHint: string;
  uploadArtwork: string;
  uploadMediaHint: string;
  planDragDenied: string;
  deleteRoomConfirm: string;
  surfaceColorsSelected: string;
  surfaceColorsDraft: string;
};


const ADMIN_EDITOR_EN: AdminEditorStrings = {
  roomPlanTitle: "Room plan & placement",
  planMode: "Plan",
  placeMode: "Place",
  deleteRoom: "Delete room",
  rotateFigure: "Rotate",
  surfaces: "Surfaces",
  floor: "Floor",
  walls: "Walls",
  addRoom: "Add room",
  autosaveSaving: "Autosaving draft…",
  autosaveSaved: "Draft saved",
  autosaveFailed: "Autosave failed",
  retry: "Retry",
  placeBanner: "Enable Place mode to drag artworks onto the plan.",
  entranceHelp:
    "Entrance (foyer): not a room from the list — portal and spawn. Bright edge is the gallery door;",
  entranceHelpBody:
    "outside. Snap the portal to a room (or a room to the entrance) — rotation adjusts automatically. Use the rotate control on the selected figure (square +45°, others +90°, entrance +90°). Drag the empty canvas to pan the view.",
  entranceHelpPlaceDrag:
    " In Place mode, drag a work from the list onto the plan or move a marker.",
  entranceHelpRoomsMeta:
    " Rooms: drag to move, corner handle to stretch, rotate button beside selection; doors: {count}.",
  entranceHelpAddRoom: " Add at least one room.",
  entranceLabel: "entrance",
  dropNoSnap: "Drop on a gallery room (not the entrance).",
  dropConflict: "Too close to another work.",
  dropOutside: "Release inside a room.",
  placeOnPlan: "Place on plan",
  placeInstructions:
    "Drop paintings onto a room to snap to the nearest wall; sculptures onto the floor. Green ghost = you can drop.",
  frame: "Frame",
  remove: "Remove",
  removeFromPlan: "Remove from plan",
  painting: "painting",
  sculpture: "sculpture",
  publishArtworksFirst: "Publish artworks first, then place them on the plan.",
  emptyPlacePalette: "No artworks yet. Upload on this page or Artworks, then place them here.",
  unpublishedBadge: "draft",
  untitled: "(untitled)",
  publishToLive: "Publish to live site",
  openDraft3d: "Open draft in 3D",
  openLive3d: "Open live exhibition in 3D",
  artworksPlaceHint:
    "Upload here, then place works on the room plan in Place mode. Live gallery updates only after Publish.",
  draftAutosaveIntro: "Draft autosaves on every layout change.",
  lastLivePublish: " Last live publish: {date}.",
  unpublishedDraft: " Unpublished draft changes.",
  liveMatchesDraft: " Live matches draft.",
  publishLiveHint: " Live gallery updates only after Publish.",
  uploadArtwork: "+ Upload artwork",
  uploadMediaHint:
    "Media file — image, video (MP4/MOV/M4V/WebM), or 3D model (GLB/GLTF). Type is detected automatically. Wall playback uses the browser decoder (iPhone MOV/HEVC on Safari; prefer H.264 MP4 for widest support).",
  planDragDenied: "Switch to Place mode to drag artworks onto the plan.",
  deleteRoomConfirm:
    "Delete this room? Placements in it will be removed from the plan.",
  surfaceColorsSelected: "Colors apply to the selected room.",
  surfaceColorsDraft: "Defaults for the next room you add (select a room to edit its colors).",
};


const ADMIN_EDITOR_RU: AdminEditorStrings = {
  roomPlanTitle: "План зала и расстановка",
  planMode: "План",
  placeMode: "Place",
  deleteRoom: "Удалить комнату",
  rotateFigure: "Повернуть",
  surfaces: "Поверхности",
  floor: "Пол",
  walls: "Стены",
  addRoom: "Добавить комнату",
  autosaveSaving: "Сохранение черновика…",
  autosaveSaved: "Черновик сохранён",
  autosaveFailed: "Ошибка автосохранения",
  retry: "Повторить",
  placeBanner: "Включите режим Place, чтобы перетаскивать работы на план.",
  entranceHelp:
    "Вход (фойе): не комната из списка — портал и spawn. Светлая грань — дверь в галерею;",
  entranceHelpBody:
    "снаружи. Подведи портал к комнате (или комнату ко входу) — поворот подстроится сам. Кнопка поворота у выбранной фигуры: квадрат +45°, остальные +90°, вход +90°. По пустому полю — перетаскивание, чтобы сдвинуть вид схемы.",
  entranceHelpPlaceDrag:
    " В режиме Place перетащите работу со списка на план или сдвиньте маркер.",
  entranceHelpRoomsMeta:
    " Комнаты: перетаскивание, угол — stretch, кнопка поворота у выделения; дверей: {count}.",
  entranceHelpAddRoom: " Добавьте хотя бы одну комнату.",
  entranceLabel: "вход",
  dropNoSnap: "Отпустите на комнату галереи (не на вход).",
  dropConflict: "Слишком близко к другой работе.",
  dropOutside: "Отпустите внутри комнаты.",
  placeOnPlan: "Расстановка на плане",
  placeInstructions:
    "Картину отпустите на комнату — прилипнет к ближайшей стене; скульптуру — на пол. Зелёный призрак = можно отпустить.",
  frame: "Рама",
  remove: "Убрать",
  removeFromPlan: "Убрать с плана",
  painting: "картина",
  sculpture: "скульптура",
  publishArtworksFirst: "Сначала опубликуйте работы, затем расставьте на плане.",
  emptyPlacePalette:
    "Нет работ. Загрузите здесь или во вкладке Artworks, затем расставьте на плане.",
  unpublishedBadge: "черновик",
  untitled: "(без названия)",
  publishToLive: "Опубликовать на сайт",
  openDraft3d: "Открыть черновик в 3D",
  openLive3d: "Открыть live-выставку в 3D",
  artworksPlaceHint:
    "Загружайте здесь, затем расставляйте на плане в режиме Place. Live обновляется только после Publish.",
  draftAutosaveIntro: "Черновик сохраняется при каждом изменении плана.",
  lastLivePublish: " Последняя публикация: {date}.",
  unpublishedDraft: " Есть неопубликованные изменения.",
  liveMatchesDraft: " Live совпадает с черновиком.",
  publishLiveHint: " Live обновляется только после Publish.",
  uploadArtwork: "+ Загрузить работу",
  uploadMediaHint:
    "Файл — изображение, видео (MP4/MOV/M4V/WebM) или 3D-модель (GLB/GLTF). Тип определяется автоматически. На стене играет декодер браузера (iPhone MOV/HEVC в Safari; для максимальной совместимости — H.264 MP4).",
  planDragDenied: "Переключитесь в Place, чтобы перетаскивать работы на план.",
  deleteRoomConfirm:
    "Удалить комнату? Расстановка в ней будет снята с плана.",
  surfaceColorsSelected: "Цвета применяются к выбранной комнате.",
  surfaceColorsDraft:
    "Цвета по умолчанию для следующей комнаты (выберите комнату, чтобы менять её цвета).",
};


export const ADMIN_EDITOR: Record<Locale, AdminEditorStrings> = {
  en: ADMIN_EDITOR_EN,
  ru: ADMIN_EDITOR_RU,
  uk: ADMIN_EDITOR_EN,
  he: ADMIN_EDITOR_EN,
};

export function adminEditorStrings(locale: Locale): AdminEditorStrings {
  return ADMIN_EDITOR[locale] ?? ADMIN_EDITOR.en;
}

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
