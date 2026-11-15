using Gallery.Catalog;
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
    /// Runtime entry: quality tier → catalog fetch → room + artworks + player + bridges.
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
            StarSkybox.Apply(cam);
            spawner.Initialize(room, player.transform);

            var localeGo = new GameObject("LocaleUI");
            var locale = localeGo.AddComponent<LocaleUI>();

            var rayGo = new GameObject("InteractionRaycaster");
            var ray = rayGo.AddComponent<InteractionRaycaster>();
            ray.Initialize(player, locale, media);
            locale.Initialize(loader.InitialLang, ray);

            loader.Loaded += catalog =>
            {
                locale.Initialize(loader.InitialLang, ray);
                locale.BindCatalog(catalog);
                // Room length + slot count driven by the same published N as admin schematic.
                var n = catalog.artworks != null ? catalog.artworks.Length : 0;
                room.Build(n);
                player.Configure(room.Length, QualityTier.IsMobileTier);
                spawner.Initialize(room, player.transform);
                spawner.Spawn(catalog);
                StarSkybox.Apply(cam);
            };

            loader.Failed += err =>
            {
                Debug.LogError(err);
                room.Build(0);
                player.Configure(room.Length, QualityTier.IsMobileTier);
                StarSkybox.Apply(cam);
            };

            loader.BeginLoad();
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
            light.intensity = 1.05f;
            light.shadows = QualityTier.IsMobileTier ? LightShadows.None : LightShadows.Hard;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.55f, 0.55f, 0.58f);
            // Skybox applied after Main Camera exists (StarSkybox.Apply).
        }
    }
}
