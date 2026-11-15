using Gallery.Admin;
using Gallery.Catalog;
using Gallery.Entrance;
using Gallery.Media;
using Gallery.Player;
using Gallery.Quality;
using Gallery.Room;
using Gallery.UI;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Gallery.Bootstrap
{
    /// <summary>
    /// Runtime entry: quality tier → catalog fetch → entrance + room + artworks + player + bridges.
    /// Attach to an empty GameObject in Scenes/Gallery (or let RuntimeInitialize create it).
    /// </summary>
    public class GalleryBootstrap : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AutoBootstrap()
        {
            if (Object.FindFirstObjectByType<GalleryBootstrap>() != null)
                return;

            var go = new GameObject("GalleryBootstrap");
            go.AddComponent<GalleryBootstrap>();
        }

        void Start()
        {
            QualityTier.Apply();
            EnsureEventSystem();
            EnsureLighting();

            var mediaGo = new GameObject("MediaBridge");
            var media = mediaGo.AddComponent<MediaBridge>();

            var catalogGo = new GameObject("CatalogLoader");
            var loader = catalogGo.AddComponent<CatalogLoader>();

            var roomGo = new GameObject("RoomBuilder");
            var room = roomGo.AddComponent<RoomBuilder>();

            var entranceGo = new GameObject("EntranceBuilder");
            var entrance = entranceGo.AddComponent<EntranceBuilder>();

            var spawnGo = new GameObject("ArtworkSpawner");
            var spawner = spawnGo.AddComponent<ArtworkSpawner>();

            var playerGo = new GameObject("Player");
            var player = playerGo.AddComponent<PlayerController>();
            var cam = Camera.main;
            if (cam == null)
            {
                var camGo = new GameObject("Main Camera");
                cam = camGo.AddComponent<Camera>();
                cam.tag = "MainCamera";
                camGo.AddComponent<AudioListener>();
            }

            player.AttachCamera(cam);
            spawner.Initialize(room, player.transform);

            var bookletGo = new GameObject("BookletController");
            var booklet = bookletGo.AddComponent<BookletController>();
            booklet.Initialize(player);

            var localeGo = new GameObject("LocaleUI");
            var locale = localeGo.AddComponent<LocaleUI>();

            var rayGo = new GameObject("InteractionRaycaster");
            var ray = rayGo.AddComponent<InteractionRaycaster>();
            ray.Initialize(player, locale, media, booklet);
            locale.Initialize(loader.InitialLang, ray);

            loader.Loaded += catalog =>
            {
                locale.Initialize(loader.InitialLang, ray);
                locale.BindCatalog(catalog);
                room.BuildFromCatalog(catalog);
                entrance.Build(catalog, room.GalleryStartZ);

                var walkMin = entrance.WalkMinZ;
                var walkMax = Mathf.Max(walkMin + 2f, room.GalleryEndZ - 0.35f);
                player.ConfigureSpawn(
                    room.Length,
                    QualityTier.IsMobileTier,
                    spawnZ: entrance.SpawnZ,
                    walkMinZ: walkMin,
                    walkMaxZ: walkMax,
                    yaw: entrance.SpawnYaw,
                    spawnX: entrance.SpawnX);

                booklet.Bind(catalog, entrance.Pedestal, loader.InitialLang);
                spawner.Initialize(room, player.transform);
                spawner.Spawn(catalog);

                var adminBuild = loader.AdminBuildMode || AdminBuildMode.Active;
                if (!AdminBuildMode.LightLoad)
                    StarSkybox.Apply(cam);
                else
                    ApplyLightPreviewRendering();

                if (adminBuild)
                {
                    AdminBuildBootstrap.Enable(
                        cam,
                        player,
                        room,
                        spawner,
                        catalog,
                        booklet,
                        locale,
                        ray);
                }
            };

            loader.Failed += err =>
            {
                Debug.LogError(err);
                room.Build(0);
                entrance.Build(null, room.GalleryStartZ);
                player.ConfigureSpawn(
                    room.Length,
                    QualityTier.IsMobileTier,
                    spawnZ: entrance.SpawnZ,
                    walkMinZ: entrance.WalkMinZ,
                    walkMaxZ: Mathf.Max(entrance.WalkMinZ + 2f, room.GalleryEndZ - 0.35f),
                    yaw: entrance.SpawnYaw,
                    spawnX: entrance.SpawnX);
                booklet.Bind(null, entrance.Pedestal, loader.InitialLang);
                if (!AdminBuildMode.LightLoad)
                    StarSkybox.Apply(cam);
            };

            loader.BeginLoad();
        }

        static void ApplyLightPreviewRendering()
        {
            var lights = Object.FindObjectsByType<Light>(FindObjectsSortMode.None);
            for (var i = 0; i < lights.Length; i++)
            {
                if (lights[i] != null && lights[i].type == LightType.Directional)
                    lights[i].shadows = LightShadows.None;
            }

            RenderSettings.ambientLight = new Color(0.78f, 0.79f, 0.82f);
        }

        static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<EventSystem>() != null)
                return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        static void EnsureLighting()
        {
            if (Object.FindFirstObjectByType<Light>() != null)
                return;

            var lightGo = new GameObject("KeyLight");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            // Soft key + higher ambient so mid-grey walls read without blow-out.
            light.intensity = 0.95f;
            light.shadows = QualityTier.IsMobileTier ? LightShadows.None : LightShadows.Soft;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.70f, 0.72f, 0.76f);
        }
    }
}
