using System;

namespace Gallery.UI
{
    public enum GalleryLayer
    {
        None = 0,
        Info = 1,
        Image = 2,
        Video = 3,
        Booklet = 4
    }

    /// <summary>
    /// Single UI layer for gallery Play: only one of Info / Image / Video / Booklet at a time.
    /// Esc closes the top layer; look/move gating reads from here.
    /// </summary>
    public static class GalleryUIState
    {
        public static GalleryLayer Layer { get; private set; } = GalleryLayer.None;

        public static bool IsInfoOpen => Layer == GalleryLayer.Info;
        public static bool IsImageOpen => Layer == GalleryLayer.Image;
        public static bool IsVideoOpen => Layer == GalleryLayer.Video;
        public static bool IsBookletOpen => Layer == GalleryLayer.Booklet;
        public static bool IsMediaOverlay => Layer == GalleryLayer.Image || Layer == GalleryLayer.Video;

        /// <summary>Info, image, video, and booklet all pause mouse / look-zone look.</summary>
        public static bool BlocksLook => Layer != GalleryLayer.None;

        /// <summary>Video/image freeze move; info/booklet keep WASD.</summary>
        public static bool BlocksMove => Layer == GalleryLayer.Image || Layer == GalleryLayer.Video;

        public static event Action Changed;

        public static void Set(GalleryLayer layer)
        {
            if (Layer == layer) return;
            Layer = layer;
            Changed?.Invoke();
        }

        public static void Clear()
        {
            Set(GalleryLayer.None);
        }

        public static void ClearIf(GalleryLayer layer)
        {
            if (Layer == layer)
                Clear();
        }

        /// <summary>Esc closes the active top layer. Returns true if a layer was closed.</summary>
        public static bool TryCloseTop(Action closeInfo, Action closeMedia, Action closeBooklet = null)
        {
            switch (Layer)
            {
                case GalleryLayer.Video:
                case GalleryLayer.Image:
                    closeMedia?.Invoke();
                    return true;
                case GalleryLayer.Booklet:
                    closeBooklet?.Invoke();
                    return true;
                case GalleryLayer.Info:
                    closeInfo?.Invoke();
                    return true;
                default:
                    return false;
            }
        }
    }
}
