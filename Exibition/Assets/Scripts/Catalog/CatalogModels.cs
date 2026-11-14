using System;
using UnityEngine;

namespace Gallery.Catalog
{
    public enum ArtworkType
    {
        Image,
        Video
    }

    [Serializable]
    public class LocalizedString
    {
        public string en = "";
        public string ru = "";
        public string uk = "";
        public string he = "";

        public string Get(string lang)
        {
            if (string.IsNullOrEmpty(lang))
                lang = "en";

            switch (lang.ToLowerInvariant())
            {
                case "ru": return string.IsNullOrEmpty(ru) ? Fallback() : ru;
                case "uk": return string.IsNullOrEmpty(uk) ? Fallback() : uk;
                case "he": return string.IsNullOrEmpty(he) ? Fallback() : he;
                default: return string.IsNullOrEmpty(en) ? Fallback() : en;
            }
        }

        string Fallback()
        {
            if (!string.IsNullOrEmpty(en)) return en;
            if (!string.IsNullOrEmpty(ru)) return ru;
            if (!string.IsNullOrEmpty(uk)) return uk;
            return he ?? "";
        }
    }

    [Serializable]
    public class CatalogSettings
    {
        public LocalizedString poster = new LocalizedString();
        public string instagram = "";
        public string email = "";
        public LocalizedString bio = new LocalizedString();
    }

    [Serializable]
    public class ArtworkEntry
    {
        public string id;
        public string type = "image";
        public int sort;
        public bool published = true;
        public LocalizedString title = new LocalizedString();
        public LocalizedString text = new LocalizedString();
        public string urlWall;
        public string urlFull;
        public string urlVideo;
        public string urlPoster;

        public ArtworkType ArtworkType =>
            string.Equals(type, "video", StringComparison.OrdinalIgnoreCase)
                ? ArtworkType.Video
                : ArtworkType.Image;
    }

    [Serializable]
    public class CatalogData
    {
        public int version;
        public string updatedAt;
        public CatalogSettings settings = new CatalogSettings();
        // JsonUtility requires arrays (not List<>) for JSON arrays.
        public ArtworkEntry[] artworks = Array.Empty<ArtworkEntry>();
    }

    /// <summary>
    /// Catalog JSON matches the shared web contract (GET /api/catalog).
    /// </summary>
    public static class CatalogJson
    {
        public static CatalogData Parse(string json)
        {
            if (string.IsNullOrEmpty(json))
                return new CatalogData();

            var data = JsonUtility.FromJson<CatalogData>(json);
            if (data == null)
                return new CatalogData();

            if (data.artworks == null)
                data.artworks = Array.Empty<ArtworkEntry>();

            if (data.settings == null)
                data.settings = new CatalogSettings();

            return data;
        }
    }
}
