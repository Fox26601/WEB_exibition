using System;
using System.Runtime.InteropServices;
using Gallery.Catalog;
using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Receives postMessage payloads from the admin web shell (via index.html / parent iframe).
    /// </summary>
    public class WebAdminBridge : MonoBehaviour
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        static extern void WebAdminBridge_SendPlacements(string json);

        [DllImport("__Internal")]
        static extern void WebAdminBridge_SendReady();
#else
        static void WebAdminBridge_SendPlacements(string json) =>
            Debug.Log("Admin placements: " + json);

        static void WebAdminBridge_SendReady() { }
#endif

        AdminPlacementController _placement;

        public void Wire(AdminPlacementController placement)
        {
            _placement = placement;
        }

        void Start()
        {
            WebAdminBridge_SendReady();
        }

        public void OnJsAdminMessage(string json)
        {
            if (string.IsNullOrEmpty(json)) return;

            try
            {
                var header = JsonUtility.FromJson<AdminMessageHeader>(json);
                if (header == null || string.IsNullOrEmpty(header.type))
                    return;

                switch (header.type)
                {
                    case "gallery-admin-init":
                        HandleInit(json);
                        break;
                    case "gallery-admin-begin-drag":
                        _placement?.BeginDrag(JsonUtility.FromJson<AdminDragMessage>(json));
                        break;
                    case "gallery-admin-end-drag":
                        _placement?.EndDrag(JsonUtility.FromJson<AdminEndDragMessage>(json));
                        break;
                    case "gallery-admin-remove":
                        _placement?.Remove(JsonUtility.FromJson<AdminRemoveMessage>(json)?.artworkId);
                        break;
                    case "gallery-admin-set-frame":
                        _placement?.SetFrame(JsonUtility.FromJson<AdminFrameMessage>(json));
                        break;
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning("WebAdminBridge parse failed: " + ex.Message);
            }
        }

        void HandleInit(string json)
        {
            var envelope = JsonUtility.FromJson<AdminInitEnvelope>(json);
            if (envelope?.layout == null)
                return;
            _placement?.ApplyLayout(envelope.layout);
        }

        public void EmitPlacements(ArtworkPlacementData[] placements)
        {
            if (placements == null)
                return;
            var wrap = new PlacementExport { placements = placements };
            WebAdminBridge_SendPlacements(JsonUtility.ToJson(wrap));
        }
    }

    [Serializable]
    class AdminMessageHeader
    {
        public string type;
    }

    [Serializable]
    class AdminInitEnvelope
    {
        public string type;
        public GalleryLayoutData layout;
    }

    [Serializable]
    class AdminDragMessage
    {
        public string type;
        public string artworkId;
        public string kind;
        public string frameId;
    }

    [Serializable]
    class AdminEndDragMessage
    {
        public string type;
        public string artworkId;
        public bool commit;
    }

    [Serializable]
    class AdminRemoveMessage
    {
        public string type;
        public string artworkId;
    }

    [Serializable]
    class AdminFrameMessage
    {
        public string type;
        public string artworkId;
        public string frameId;
    }

    [Serializable]
    class PlacementExport
    {
        public ArtworkPlacementData[] placements;
    }
}