using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Gallery.Catalog
{
    /// <summary>
    /// Loads live or draft catalog from GET /api/catalog based on URL query params.
    /// Query: ?catalog=live|draft&amp;lang=en|ru|uk|he&amp;token=… (draft preview).
    /// When the API is unreachable, loads Assets/StreamingAssets/catalog.json (Editor/offline Play).
    /// </summary>
    public class CatalogLoader : MonoBehaviour
    {
        public const string DefaultCatalogPath = "/api/catalog";
        public const string StreamingCatalogFile = "catalog.json";

        [SerializeField] string catalogPath = DefaultCatalogPath;
        [SerializeField] bool useStreamingAssetsWhenOffline = true;
        [SerializeField] bool useMockWhenOffline = true;

        public CatalogData Catalog { get; private set; }
        public string CatalogMode { get; private set; } = "live";
        public string InitialLang { get; private set; } = "en";
        public bool IsLoaded { get; private set; }
        public string LastError { get; private set; }

        public event Action<CatalogData> Loaded;
        public event Action<string> Failed;

        void Awake()
        {
            ParseQueryParams(out var mode, out var lang, out _);
            CatalogMode = mode;
            InitialLang = lang;
        }

        public void BeginLoad()
        {
            StopAllCoroutines();
            StartCoroutine(LoadRoutine());
        }

        IEnumerator LoadRoutine()
        {
            IsLoaded = false;
            LastError = null;

            ParseQueryParams(out var mode, out var lang, out var token);
            CatalogMode = mode;
            InitialLang = lang;

            var url = BuildCatalogUrl(mode, token);
            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = 8;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                {
                    ApplyJson(req.downloadHandler.text);
                    yield break;
                }

                LastError = $"Catalog fetch failed ({req.responseCode}): {req.error} @ {url}";
                Debug.LogWarning(LastError);
            }

            if (useStreamingAssetsWhenOffline)
            {
                var streamingPath = Path.Combine(Application.streamingAssetsPath, StreamingCatalogFile);
#if UNITY_ANDROID && !UNITY_EDITOR
                using (var fileReq = UnityWebRequest.Get(streamingPath))
                {
                    yield return fileReq.SendWebRequest();
                    if (fileReq.result == UnityWebRequest.Result.Success)
                    {
                        Debug.Log("CatalogLoader: using StreamingAssets/catalog.json");
                        ApplyJson(fileReq.downloadHandler.text);
                        yield break;
                    }
                }
#else
                if (File.Exists(streamingPath))
                {
                    Debug.Log("CatalogLoader: using StreamingAssets/catalog.json");
                    ApplyJson(File.ReadAllText(streamingPath, Encoding.UTF8));
                    yield break;
                }
#endif
                Debug.LogWarning($"CatalogLoader: StreamingAssets catalog missing at {streamingPath}");
            }

            if (useMockWhenOffline)
            {
                ApplyJson(MockCatalogJson());
                yield break;
            }

            Failed?.Invoke(LastError ?? "Catalog unavailable");
        }

        void ApplyJson(string json)
        {
            Catalog = CatalogJson.Parse(json);
            Catalog.artworks = FilterPublished(Catalog.artworks);
            Array.Sort(Catalog.artworks, (a, b) => a.sort.CompareTo(b.sort));
            IsLoaded = true;
            Loaded?.Invoke(Catalog);
        }

        static ArtworkEntry[] FilterPublished(ArtworkEntry[] source)
        {
            if (source == null || source.Length == 0)
                return Array.Empty<ArtworkEntry>();

            var list = new List<ArtworkEntry>(source.Length);
            foreach (var a in source)
            {
                if (a != null && a.published)
                    list.Add(a);
            }

            return list.ToArray();
        }

        string BuildCatalogUrl(string mode, string token)
        {
            var origin = ResolveOrigin();
            var sb = new StringBuilder();
            sb.Append(origin);
            if (!catalogPath.StartsWith("/"))
                sb.Append('/');
            sb.Append(catalogPath);
            sb.Append("?mode=").Append(UnityWebRequest.EscapeURL(mode));
            // Web contract also accepts catalog=live|draft
            sb.Append("&catalog=").Append(UnityWebRequest.EscapeURL(mode));
            if (!string.IsNullOrEmpty(token))
                sb.Append("&token=").Append(UnityWebRequest.EscapeURL(token));
            return sb.ToString();
        }

        static string ResolveOrigin()
        {
#if UNITY_EDITOR
            // Local Next.js default while editing in Editor.
            return "http://localhost:3000";
#else
            var absolute = Application.absoluteURL;
            if (string.IsNullOrEmpty(absolute))
                return "";

            try
            {
                var uri = new Uri(absolute);
                return uri.GetLeftPart(UriPartial.Authority);
            }
            catch
            {
                return "";
            }
#endif
        }

        public static void ParseQueryParams(out string catalogMode, out string lang, out string token)
        {
            catalogMode = "live";
            lang = "en";
            token = "";

            var absolute = Application.absoluteURL;
            if (string.IsNullOrEmpty(absolute))
            {
                // Editor / missing URL: allow PlayerPrefs override for testing.
                catalogMode = PlayerPrefs.GetString("gallery.catalog", "live");
                lang = PlayerPrefs.GetString("gallery.lang", "en");
                return;
            }

            var queryIndex = absolute.IndexOf('?');
            if (queryIndex < 0 || queryIndex >= absolute.Length - 1)
                return;

            var query = absolute.Substring(queryIndex + 1);
            var hash = query.IndexOf('#');
            if (hash >= 0)
                query = query.Substring(0, hash);

            foreach (var pair in query.Split('&'))
            {
                if (string.IsNullOrEmpty(pair)) continue;
                var eq = pair.IndexOf('=');
                var key = eq >= 0 ? Uri.UnescapeDataString(pair.Substring(0, eq)) : Uri.UnescapeDataString(pair);
                var value = eq >= 0 && eq < pair.Length - 1
                    ? Uri.UnescapeDataString(pair.Substring(eq + 1))
                    : "";

                switch (key.ToLowerInvariant())
                {
                    case "catalog":
                    case "mode":
                        if (string.Equals(value, "draft", StringComparison.OrdinalIgnoreCase))
                            catalogMode = "draft";
                        else
                            catalogMode = "live";
                        break;
                    case "lang":
                    case "locale":
                        lang = NormalizeLang(value);
                        break;
                    case "token":
                        token = value;
                        break;
                }
            }
        }

        public static string NormalizeLang(string value)
        {
            if (string.IsNullOrEmpty(value)) return "en";
            switch (value.ToLowerInvariant())
            {
                case "ru": return "ru";
                case "uk": return "uk";
                case "he": return "he";
                default: return "en";
            }
        }

        static string MockCatalogJson()
        {
            return @"{
  ""version"": 1,
  ""updatedAt"": ""mock"",
  ""settings"": {
    ""poster"": { ""en"": ""Exhibition"", ""ru"": ""Выставка"", ""uk"": ""Виставка"", ""he"": ""תערוכה"" },
    ""instagram"": """",
    ""email"": """",
    ""bio"": { ""en"": """", ""ru"": """", ""uk"": """", ""he"": """" }
  },
  ""artworks"": []
}";
        }
    }
}
