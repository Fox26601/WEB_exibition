using System.Collections;
using Gallery.Catalog;
using Gallery.Room;
using UnityEngine;
using UnityEngine.Networking;

namespace Gallery.Entrance
{
    /// <summary>
    /// Always-on entrance module: floor corridor, labeled arch, left poster, pedestal booklet.
    /// Legacy: placed just before gallery min-Z. Layout: follows layout.entrance pose.
    /// </summary>
    public class EntranceBuilder : MonoBehaviour
    {
        public const float Depth = 6f;
        public const float ArchWidth = 2.4f;
        public const float ArchHeight = 2.6f;
        public const float ArchThickness = 0.35f;
        /// <summary>Schematic footprint depth (portal offset from entrance center).</summary>
        public const float SchematicDepth = 3f;

        Transform _root;
        PedestalInteractable _pedestal;
        MeshRenderer _posterRenderer;

        public float GalleryStartZ { get; private set; }
        public float SpawnZ { get; private set; }
        public float SpawnX { get; private set; }
        public float SpawnYaw { get; private set; }
        public float WalkMinZ { get; private set; }
        public PedestalInteractable Pedestal => _pedestal;

        public void Build(CatalogData catalog, float galleryStartZFallback)
        {
            Clear();

            var pose = catalog?.layout != null && catalog.layout.HasRooms
                ? catalog.layout.entrance
                : null;

            if (pose != null)
                BuildFromPose(catalog, pose);
            else
                BuildLegacy(catalog, galleryStartZFallback);
        }

        void BuildFromPose(CatalogData catalog, LayoutEntranceData pose)
        {
            var rad = pose.rotation * Mathf.Deg2Rad;
            var halfSchematic = SchematicDepth * 0.5f;
            // Portal mid = entrance center + rotate(+local Z * half schematic depth).
            var portalX = pose.x - halfSchematic * Mathf.Sin(rad);
            var portalZ = pose.z + halfSchematic * Mathf.Cos(rad);
            var portal = new Vector3(portalX, 0f, portalZ);
            var yaw = pose.rotation;
            var intoGallery = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            var intoCorridor = -intoGallery;

            GalleryStartZ = portalZ;
            SpawnYaw = yaw;
            var spawn = portal + intoCorridor * (Depth - 1.35f);
            SpawnX = spawn.x;
            SpawnZ = spawn.z;
            var walkMin = portal + intoCorridor * (Depth - 0.35f);
            WalkMinZ = walkMin.z;

            _root = new GameObject("Entrance").transform;
            _root.SetParent(transform, false);
            _root.position = portal;
            _root.rotation = Quaternion.Euler(0f, yaw, 0f);

            var floorColor = new Color(0.78f, 0.76f, 0.72f);
            var wallColor = new Color(0.90f, 0.89f, 0.86f);
            var trimColor = new Color(0.35f, 0.32f, 0.28f);
            var midLocalZ = -Depth * 0.5f;

            // Local: +Z into gallery (portal at 0), corridor extends toward -Z.
            CreateBoxLocal(_root, "EntranceFloor",
                new Vector3(0f, -0.05f, midLocalZ),
                new Vector3(RoomBuilder.Width, 0.1f, Depth),
                floorColor);

            CreateBoxLocal(_root, "EntranceWallLeft",
                new Vector3(-RoomBuilder.Width * 0.5f, RoomBuilder.Height * 0.5f, midLocalZ),
                new Vector3(RoomBuilder.WallThickness, RoomBuilder.Height, Depth),
                wallColor);

            CreateBoxLocal(_root, "EntranceWallRight",
                new Vector3(RoomBuilder.Width * 0.5f, RoomBuilder.Height * 0.5f, midLocalZ),
                new Vector3(RoomBuilder.WallThickness, RoomBuilder.Height, Depth),
                wallColor);

            CreateBoxLocal(_root, "EntranceWallBack",
                new Vector3(0f, RoomBuilder.Height * 0.5f, -Depth),
                new Vector3(RoomBuilder.Width, RoomBuilder.Height, RoomBuilder.WallThickness),
                wallColor);

            BuildArchLocal(0f, trimColor);
            BuildPosterLocal(-Depth * 0.55f, catalog);
            BuildPedestalLocal(-Depth * 0.62f, trimColor);
        }

        void BuildLegacy(CatalogData catalog, float galleryStartZ)
        {
            GalleryStartZ = galleryStartZ;
            SpawnYaw = 0f;
            SpawnX = 0f;
            SpawnZ = galleryStartZ - Depth + 1.35f;
            WalkMinZ = galleryStartZ - Depth + 0.35f;

            _root = new GameObject("Entrance").transform;
            _root.SetParent(transform, false);

            var floorColor = new Color(0.78f, 0.76f, 0.72f);
            var wallColor = new Color(0.90f, 0.89f, 0.86f);
            var trimColor = new Color(0.35f, 0.32f, 0.28f);
            var midZ = galleryStartZ - Depth * 0.5f;

            CreateBox(_root, "EntranceFloor",
                new Vector3(0f, -0.05f, midZ),
                new Vector3(RoomBuilder.Width, 0.1f, Depth),
                floorColor);

            CreateBox(_root, "EntranceWallLeft",
                new Vector3(-RoomBuilder.Width * 0.5f, RoomBuilder.Height * 0.5f, midZ),
                new Vector3(RoomBuilder.WallThickness, RoomBuilder.Height, Depth),
                wallColor);

            CreateBox(_root, "EntranceWallRight",
                new Vector3(RoomBuilder.Width * 0.5f, RoomBuilder.Height * 0.5f, midZ),
                new Vector3(RoomBuilder.WallThickness, RoomBuilder.Height, Depth),
                wallColor);

            CreateBox(_root, "EntranceWallBack",
                new Vector3(0f, RoomBuilder.Height * 0.5f, galleryStartZ - Depth),
                new Vector3(RoomBuilder.Width, RoomBuilder.Height, RoomBuilder.WallThickness),
                wallColor);

            BuildArch(galleryStartZ, trimColor);
            BuildPoster(galleryStartZ, catalog);
            BuildPedestal(galleryStartZ, trimColor);
        }

        void BuildArchLocal(float localZ, Color trimColor)
        {
            var halfGap = ArchWidth * 0.5f;
            var pillarW = 0.45f;
            var leftX = -halfGap - pillarW * 0.5f;
            var rightX = halfGap + pillarW * 0.5f;

            CreateBoxLocal(_root, "ArchPillarL",
                new Vector3(leftX, ArchHeight * 0.5f, localZ),
                new Vector3(pillarW, ArchHeight, ArchThickness),
                trimColor);
            CreateBoxLocal(_root, "ArchPillarR",
                new Vector3(rightX, ArchHeight * 0.5f, localZ),
                new Vector3(pillarW, ArchHeight, ArchThickness),
                trimColor);
            CreateBoxLocal(_root, "ArchLintel",
                new Vector3(0f, ArchHeight + 0.2f, localZ),
                new Vector3(ArchWidth + pillarW * 2f, 0.4f, ArchThickness + 0.05f),
                trimColor);

            var side = (RoomBuilder.Width - ArchWidth) * 0.5f - pillarW;
            if (side > 0.05f)
            {
                var sideX = ArchWidth * 0.5f + pillarW + side * 0.5f;
                CreateBoxLocal(_root, "ArchFillL",
                    new Vector3(-sideX, RoomBuilder.Height * 0.5f, localZ),
                    new Vector3(side, RoomBuilder.Height, ArchThickness * 0.7f),
                    new Color(0.88f, 0.87f, 0.84f));
                CreateBoxLocal(_root, "ArchFillR",
                    new Vector3(sideX, RoomBuilder.Height * 0.5f, localZ),
                    new Vector3(side, RoomBuilder.Height, ArchThickness * 0.7f),
                    new Color(0.88f, 0.87f, 0.84f));
            }

            var label = GameObject.CreatePrimitive(PrimitiveType.Quad);
            label.name = "ArchLabel";
            label.transform.SetParent(_root, false);
            label.transform.localPosition = new Vector3(0f, ArchHeight + 0.55f, localZ - 0.02f);
            label.transform.localRotation = Quaternion.identity;
            label.transform.localScale = new Vector3(2.2f, 0.35f, 1f);
            var labelMat = RuntimeMaterials.Create(new Color(0.12f, 0.11f, 0.1f));
            label.GetComponent<MeshRenderer>().sharedMaterial = labelMat;
            Object.Destroy(label.GetComponent<Collider>());

            AttachArchLabelText(label.transform);
        }

        void BuildArch(float z, Color trimColor)
        {
            var halfGap = ArchWidth * 0.5f;
            var pillarW = 0.45f;
            var leftX = -halfGap - pillarW * 0.5f;
            var rightX = halfGap + pillarW * 0.5f;

            CreateBox(_root, "ArchPillarL",
                new Vector3(leftX, ArchHeight * 0.5f, z),
                new Vector3(pillarW, ArchHeight, ArchThickness),
                trimColor);
            CreateBox(_root, "ArchPillarR",
                new Vector3(rightX, ArchHeight * 0.5f, z),
                new Vector3(pillarW, ArchHeight, ArchThickness),
                trimColor);
            CreateBox(_root, "ArchLintel",
                new Vector3(0f, ArchHeight + 0.2f, z),
                new Vector3(ArchWidth + pillarW * 2f, 0.4f, ArchThickness + 0.05f),
                trimColor);

            var side = (RoomBuilder.Width - ArchWidth) * 0.5f - pillarW;
            if (side > 0.05f)
            {
                var sideX = ArchWidth * 0.5f + pillarW + side * 0.5f;
                CreateBox(_root, "ArchFillL",
                    new Vector3(-sideX, RoomBuilder.Height * 0.5f, z),
                    new Vector3(side, RoomBuilder.Height, ArchThickness * 0.7f),
                    new Color(0.88f, 0.87f, 0.84f));
                CreateBox(_root, "ArchFillR",
                    new Vector3(sideX, RoomBuilder.Height * 0.5f, z),
                    new Vector3(side, RoomBuilder.Height, ArchThickness * 0.7f),
                    new Color(0.88f, 0.87f, 0.84f));
            }

            var label = GameObject.CreatePrimitive(PrimitiveType.Quad);
            label.name = "ArchLabel";
            label.transform.SetParent(_root, false);
            label.transform.position = new Vector3(0f, ArchHeight + 0.55f, z - 0.02f);
            label.transform.localScale = new Vector3(2.2f, 0.35f, 1f);
            var labelMat = RuntimeMaterials.Create(new Color(0.12f, 0.11f, 0.1f));
            label.GetComponent<MeshRenderer>().sharedMaterial = labelMat;
            Object.Destroy(label.GetComponent<Collider>());

            AttachArchLabelText(label.transform);
        }

        static void AttachArchLabelText(Transform label)
        {
            var labelCanvas = new GameObject("ArchLabelText");
            labelCanvas.transform.SetParent(label, false);
            var canvas = labelCanvas.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var rt = labelCanvas.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(220f, 36f);
            labelCanvas.transform.localPosition = Vector3.zero;
            labelCanvas.transform.localScale = new Vector3(0.01f, 0.01f, 0.01f);
            var textGo = new GameObject("Text");
            textGo.transform.SetParent(labelCanvas.transform, false);
            var text = textGo.AddComponent<UnityEngine.UI.Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (text.font == null)
                text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            text.text = "exhibition";
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;
            text.fontSize = 28;
            text.fontStyle = FontStyle.Bold;
            var textRt = text.GetComponent<RectTransform>();
            textRt.anchorMin = Vector2.zero;
            textRt.anchorMax = Vector2.one;
            textRt.offsetMin = Vector2.zero;
            textRt.offsetMax = Vector2.zero;
        }

        void BuildPosterLocal(float localZ, CatalogData catalog)
        {
            var poster = GameObject.CreatePrimitive(PrimitiveType.Quad);
            poster.name = "EntrancePoster";
            poster.transform.SetParent(_root, false);
            poster.transform.localPosition = new Vector3(-RoomBuilder.Width * 0.5f + 0.08f, 1.7f, localZ);
            poster.transform.localRotation = Quaternion.Euler(0f, 90f, 0f);
            poster.transform.localScale = new Vector3(1.6f, 2.2f, 1f);
            _posterRenderer = poster.GetComponent<MeshRenderer>();
            _posterRenderer.sharedMaterial = RuntimeMaterials.CreateTextured(new Color(0.75f, 0.72f, 0.68f));
            Object.Destroy(poster.GetComponent<Collider>());

            var url = catalog?.settings?.entrance?.posterUrl;
            if (!string.IsNullOrEmpty(url))
                StartCoroutine(LoadPoster(url));
        }

        void BuildPoster(float galleryStartZ, CatalogData catalog)
        {
            var posterZ = galleryStartZ - Depth * 0.55f;
            var poster = GameObject.CreatePrimitive(PrimitiveType.Quad);
            poster.name = "EntrancePoster";
            poster.transform.SetParent(_root, false);
            poster.transform.position = new Vector3(-RoomBuilder.Width * 0.5f + 0.08f, 1.7f, posterZ);
            poster.transform.rotation = Quaternion.Euler(0f, 90f, 0f);
            poster.transform.localScale = new Vector3(1.6f, 2.2f, 1f);
            _posterRenderer = poster.GetComponent<MeshRenderer>();
            _posterRenderer.sharedMaterial = RuntimeMaterials.CreateTextured(new Color(0.75f, 0.72f, 0.68f));
            Object.Destroy(poster.GetComponent<Collider>());

            var url = catalog?.settings?.entrance?.posterUrl;
            if (!string.IsNullOrEmpty(url))
                StartCoroutine(LoadPoster(url));
        }

        void BuildPedestalLocal(float localZ, Color trimColor)
        {
            var x = -RoomBuilder.Width * 0.5f + 1.15f;

            CreateBoxLocal(_root, "PedestalBase",
                new Vector3(x, 0.35f, localZ),
                new Vector3(0.55f, 0.7f, 0.55f),
                trimColor);
            CreateBoxLocal(_root, "PedestalTop",
                new Vector3(x, 0.72f, localZ),
                new Vector3(0.62f, 0.08f, 0.62f),
                new Color(0.45f, 0.42f, 0.38f));

            var booklet = GameObject.CreatePrimitive(PrimitiveType.Cube);
            booklet.name = "PedestalBooklet";
            booklet.transform.SetParent(_root, false);
            booklet.transform.localPosition = new Vector3(x, 0.82f, localZ);
            booklet.transform.localScale = new Vector3(0.42f, 0.04f, 0.32f);
            booklet.transform.localRotation = Quaternion.Euler(0f, 18f, 0f);
            booklet.GetComponent<MeshRenderer>().sharedMaterial =
                RuntimeMaterials.Create(new Color(0.55f, 0.42f, 0.28f));

            var trigger = GameObject.CreatePrimitive(PrimitiveType.Cube);
            trigger.name = "PedestalTrigger";
            trigger.transform.SetParent(_root, false);
            trigger.transform.localPosition = new Vector3(x, 0.9f, localZ);
            trigger.transform.localScale = new Vector3(1.1f, 1.6f, 1.1f);
            Object.Destroy(trigger.GetComponent<MeshRenderer>());
            var col = trigger.GetComponent<BoxCollider>();
            col.isTrigger = true;

            _pedestal = trigger.AddComponent<PedestalInteractable>();
            _pedestal.Bind(booklet.transform);
        }

        void BuildPedestal(float galleryStartZ, Color trimColor)
        {
            var z = galleryStartZ - Depth * 0.62f;
            var x = -RoomBuilder.Width * 0.5f + 1.15f;

            CreateBox(_root, "PedestalBase",
                new Vector3(x, 0.35f, z),
                new Vector3(0.55f, 0.7f, 0.55f),
                trimColor);
            CreateBox(_root, "PedestalTop",
                new Vector3(x, 0.72f, z),
                new Vector3(0.62f, 0.08f, 0.62f),
                new Color(0.45f, 0.42f, 0.38f));

            var booklet = GameObject.CreatePrimitive(PrimitiveType.Cube);
            booklet.name = "PedestalBooklet";
            booklet.transform.SetParent(_root, false);
            booklet.transform.position = new Vector3(x, 0.82f, z);
            booklet.transform.localScale = new Vector3(0.42f, 0.04f, 0.32f);
            booklet.transform.rotation = Quaternion.Euler(0f, 18f, 0f);
            booklet.GetComponent<MeshRenderer>().sharedMaterial =
                RuntimeMaterials.Create(new Color(0.55f, 0.42f, 0.28f));

            var trigger = GameObject.CreatePrimitive(PrimitiveType.Cube);
            trigger.name = "PedestalTrigger";
            trigger.transform.SetParent(_root, false);
            trigger.transform.position = new Vector3(x, 0.9f, z);
            trigger.transform.localScale = new Vector3(1.1f, 1.6f, 1.1f);
            Object.Destroy(trigger.GetComponent<MeshRenderer>());
            var col = trigger.GetComponent<BoxCollider>();
            col.isTrigger = true;

            _pedestal = trigger.AddComponent<PedestalInteractable>();
            _pedestal.Bind(booklet.transform);
        }

        IEnumerator LoadPoster(string rawUrl)
        {
            var url = Absolutize(rawUrl);
            using (var req = UnityWebRequestTexture.GetTexture(url, true))
            {
                req.timeout = 20;
                yield return req.SendWebRequest();
                if (_posterRenderer == null) yield break;
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("Entrance poster failed: " + url + " — " + req.error);
                    yield break;
                }

                var tex = DownloadHandlerTexture.GetContent(req);
                if (tex == null) yield break;
                var mat = RuntimeMaterials.CreateTextured(Color.white);
                if (mat.HasProperty("_MainTex"))
                    mat.mainTexture = tex;
                if (mat.HasProperty("_BaseMap"))
                    mat.SetTexture("_BaseMap", tex);
                _posterRenderer.sharedMaterial = mat;
            }
        }

        static string Absolutize(string url)
        {
            if (string.IsNullOrEmpty(url)) return url;
            if (url.StartsWith("http://") || url.StartsWith("https://") || url.StartsWith("data:"))
                return url;
            if (url.StartsWith("//")) return "https:" + url;
            var origin = CatalogLoader.GetOrigin();
            if (string.IsNullOrEmpty(origin)) return url;
            if (!url.StartsWith("/")) url = "/" + url;
            return origin + url;
        }

        static void CreateBox(Transform parent, string name, Vector3 pos, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.position = pos;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = RuntimeMaterials.Create(color);
        }

        static void CreateBoxLocal(Transform parent, string name, Vector3 localPos, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = RuntimeMaterials.Create(color);
        }

        public void Clear()
        {
            StopAllCoroutines();
            _pedestal = null;
            _posterRenderer = null;
            if (_root != null)
                Destroy(_root.gameObject);
            _root = null;
        }
    }
}
