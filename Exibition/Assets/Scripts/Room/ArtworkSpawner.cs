using System.Collections;
using System.Collections.Generic;
using Gallery.Admin;
using Gallery.Catalog;
using UnityEngine;
using UnityEngine.Networking;

namespace Gallery.Room
{
    /// <summary>
    /// Places artworks from layout placements when present; otherwise legacy L/R slots.
    /// Sculptures spawn procedural stubs (modelUrl stored for future GLB loader).
    /// </summary>
    public class ArtworkSpawner : MonoBehaviour
    {
        public const int MaxConcurrentLoads = 4;
        public const int UnloadSlotDistance = 2;

        [SerializeField] float unloadThrottleSeconds = 2.5f;

        readonly List<ArtworkView> _views = new List<ArtworkView>();
        readonly Queue<ArtworkView> _loadQueue = new Queue<ArtworkView>();
        readonly HashSet<ArtworkView> _queued = new HashSet<ArtworkView>();

        int _activeLoads;
        float _nextUnloadAssets;
        Transform _player;
        RoomBuilder _room;

        public IReadOnlyList<ArtworkView> Views => _views;

        public void Initialize(RoomBuilder room, Transform player)
        {
            _room = room;
            _player = player;
        }

        public void Spawn(CatalogData catalog)
        {
            Clear();
            if (catalog == null || catalog.artworks == null)
                return;

            var root = new GameObject("Artworks").transform;
            root.SetParent(transform, false);

            if (_room != null && _room.UsingLayout && catalog.layout != null &&
                catalog.layout.placements != null && catalog.layout.placements.Length > 0)
            {
                SpawnFromLayout(catalog, root);
            }
            else
            {
                SpawnLegacySlots(catalog, root);
            }

            Debug.Log($"ArtworkSpawner: spawned {_views.Count} artworks (layout={_room != null && _room.UsingLayout}).");
        }

        void SpawnFromLayout(CatalogData catalog, Transform root)
        {
            var byId = new Dictionary<string, ArtworkEntry>();
            for (var i = 0; i < catalog.artworks.Length; i++)
            {
                var e = catalog.artworks[i];
                if (e == null || string.IsNullOrEmpty(e.id)) continue;
                byId[e.id] = e;
            }

            var placements = catalog.layout.placements;
            for (var i = 0; i < placements.Length; i++)
            {
                var p = placements[i];
                if (p == null || string.IsNullOrEmpty(p.artworkId)) continue;
                if (!byId.TryGetValue(p.artworkId, out var entry)) continue;

                Vector3 pos;
                Quaternion rot;
                var isSculpture = string.Equals(p.kind, "sculpture", System.StringComparison.OrdinalIgnoreCase)
                                  || entry.ArtworkType == ArtworkType.Model;

                if (isSculpture)
                {
                    if (!_room.TryGetSculpturePose(p, out pos, out rot))
                        continue;
                }
                else
                {
                    if (!_room.TryGetPaintingPose(p, out pos, out rot))
                        continue;
                }

                var go = new GameObject($"Artwork_{i}_{entry.id}");
                go.transform.SetParent(root, false);
                go.transform.SetPositionAndRotation(pos, rot);

                var view = go.AddComponent<ArtworkView>();
                var frameId = string.IsNullOrEmpty(p.frameId) ? entry.frameId : p.frameId;
                view.Setup(entry, i, frameId, isSculpture);
                _views.Add(view);
            }
        }

        void SpawnLegacySlots(CatalogData catalog, Transform root)
        {
            var arts = new List<ArtworkEntry>();
            for (var i = 0; i < catalog.artworks.Length; i++)
            {
                var entry = catalog.artworks[i];
                if (entry == null) continue;
                if (entry.ArtworkType == ArtworkType.Model) continue;
                arts.Add(entry);
            }

            var length = _room != null ? _room.Length : RoomBuilder.ComputeLength(arts.Count);

            for (var i = 0; i < arts.Count; i++)
            {
                var entry = arts[i];
                RoomBuilder.GetSlotPose(i, length, out var pos, out var rot, out _);

                var go = new GameObject($"Artwork_{i}_{entry.id}");
                go.transform.SetParent(root, false);
                go.transform.SetPositionAndRotation(pos, rot);

                var view = go.AddComponent<ArtworkView>();
                view.Setup(entry, i, entry.frameId, false);
                _views.Add(view);
            }
        }

        void Clear()
        {
            StopAllCoroutines();
            _loadQueue.Clear();
            _queued.Clear();
            _activeLoads = 0;
            _views.Clear();

            for (var i = transform.childCount - 1; i >= 0; i--)
                Destroy(transform.GetChild(i).gameObject);
        }

        void Update()
        {
            if (_views.Count == 0 || _player == null)
                return;
            if (AdminBuildMode.Active)
                return;

            UpdateStreaming();
        }

        void UpdateStreaming()
        {
            var playerZ = _player.position.z;
            var playerSlot = EstimateSlot(playerZ);

            for (var i = 0; i < _views.Count; i++)
            {
                var view = _views[i];
                if (view.IsSculpture)
                    continue;

                var dist = Mathf.Abs(view.Index / 2 - playerSlot);
                if (dist <= UnloadSlotDistance + 1)
                    EnqueueLoad(view);
                else if (view.HasTexture && dist > UnloadSlotDistance)
                    view.UnloadTexture();
            }

            while (_activeLoads < MaxConcurrentLoads && _loadQueue.Count > 0)
            {
                var next = _loadQueue.Dequeue();
                _queued.Remove(next);
                if (next == null || next.HasTexture)
                    continue;
                StartCoroutine(LoadWallTexture(next));
            }

            if (Time.unscaledTime >= _nextUnloadAssets)
            {
                _nextUnloadAssets = Time.unscaledTime + unloadThrottleSeconds;
                Resources.UnloadUnusedAssets();
            }
        }

        int EstimateSlot(float z)
        {
            return Mathf.Max(0, Mathf.FloorToInt((z - RoomBuilder.MarginEnds) / RoomBuilder.SlotPitch));
        }

        void EnqueueLoad(ArtworkView view)
        {
            if (view == null || view.HasTexture || _queued.Contains(view))
                return;
            if (string.IsNullOrEmpty(PreferredUrl(view)))
                return;

            _queued.Add(view);
            _loadQueue.Enqueue(view);
        }

        static string PreferredUrl(ArtworkView view)
        {
            if (view == null || view.Entry == null)
                return null;

            string raw;
            if (view.IsVideo)
            {
                raw = FirstNonEmpty(view.Entry.urlPoster, view.Entry.urlWall, view.Entry.urlFull);
            }
            else
            {
                raw = FirstNonEmpty(view.Entry.urlWall, view.Entry.urlFull, view.Entry.urlPoster);
            }

            return Absolutize(raw);
        }

        static string FirstNonEmpty(params string[] values)
        {
            if (values == null) return null;
            for (var i = 0; i < values.Length; i++)
            {
                if (!string.IsNullOrEmpty(values[i]))
                    return values[i];
            }

            return null;
        }

        static string Absolutize(string url)
        {
            if (string.IsNullOrEmpty(url))
                return url;
            if (url.StartsWith("http://") || url.StartsWith("https://") || url.StartsWith("data:"))
                return url;
            if (url.StartsWith("//"))
                return "https:" + url;

            var origin = CatalogLoader.GetOrigin();
            if (string.IsNullOrEmpty(origin))
                return url;
            if (!url.StartsWith("/"))
                url = "/" + url;
            return origin + url;
        }

        IEnumerator LoadWallTexture(ArtworkView view)
        {
            _activeLoads++;
            var url = PreferredUrl(view);
            using (var req = UnityWebRequestTexture.GetTexture(url, true))
            {
                req.timeout = 30;
                yield return req.SendWebRequest();

                if (view != null && req.result == UnityWebRequest.Result.Success)
                {
                    var tex = DownloadHandlerTexture.GetContent(req);
                    if (tex != null && (tex.width > 1024 || tex.height > 1024))
                        Debug.Log($"Wall texture {tex.width}x{tex.height} from {url} (prefer ≤1024).");
                    view.ApplyTexture(tex);
                }
                else if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"Wall texture failed: {url} — {req.error}");
                }
            }

            _activeLoads = Mathf.Max(0, _activeLoads - 1);
        }
    }
}
