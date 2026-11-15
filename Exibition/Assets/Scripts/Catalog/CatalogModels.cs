using System;
using UnityEngine;

namespace Gallery.Catalog
{
    public enum ArtworkType
    {
        Image,
        Video,
        Model
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
        public string modelUrl;
        public string frameId = "wood";

        public ArtworkType ArtworkType
        {
            get
            {
                if (string.Equals(type, "video", StringComparison.OrdinalIgnoreCase))
                    return ArtworkType.Video;
                if (string.Equals(type, "model", StringComparison.OrdinalIgnoreCase))
                    return ArtworkType.Model;
                return ArtworkType.Image;
            }
        }
    }

    [Serializable]
    public class RoomTransformData
    {
        public float x;
        public float z;
        public float rotation;
        public float scaleX = 1f;
        public float scaleZ = 1f;
    }

    [Serializable]
    public class Vec2Data
    {
        public float x;
        public float z;
    }

    [Serializable]
    public class GalleryRoomData
    {
        public string id;
        public string shape = "square";
        public RoomTransformData transform = new RoomTransformData();
        public Vec2Data[] vertices;
    }

    [Serializable]
    public class RoomConnectionData
    {
        public string roomA;
        public string roomB;
        public int edgeA;
        public int edgeB;
        public float doorwayWidth = 1.2f;
    }

    [Serializable]
    public class ArtworkPlacementData
    {
        public string artworkId;
        public string kind = "painting";
        public string roomId;
        public int wallEdgeIndex;
        public float tAlongEdge = 0.5f;
        public float floorX;
        public float floorZ;
        public float yaw;
        public string frameId = "wood";
    }

    [Serializable]
    public class GalleryLayoutData
    {
        public GalleryRoomData[] rooms = Array.Empty<GalleryRoomData>();
        public RoomConnectionData[] connections = Array.Empty<RoomConnectionData>();
        public ArtworkPlacementData[] placements = Array.Empty<ArtworkPlacementData>();

        public bool HasRooms => rooms != null && rooms.Length > 0;
    }

    [Serializable]
    public class CatalogData
    {
        public int version;
        public string updatedAt;
        public CatalogSettings settings = new CatalogSettings();
        // JsonUtility requires arrays (not List<>) for JSON arrays.
        public ArtworkEntry[] artworks = Array.Empty<ArtworkEntry>();
        public GalleryLayoutData layout;
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

            if (data.layout == null)
                data.layout = new GalleryLayoutData();
            if (data.layout.rooms == null)
                data.layout.rooms = Array.Empty<GalleryRoomData>();
            if (data.layout.connections == null)
                data.layout.connections = Array.Empty<RoomConnectionData>();
            if (data.layout.placements == null)
                data.layout.placements = Array.Empty<ArtworkPlacementData>();

            return data;
        }
    }
}
