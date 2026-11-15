using UnityEngine;

namespace Gallery.Room
{
    /// <summary>
    /// Metadata for Sims-style wall cutaway (interior / exterior shells).
    /// </summary>
    public class RoomWallSegment : MonoBehaviour
    {
        public string roomId;
        public int edgeIndex;
        public Vector3 inwardNormal;
        public Vector3 segmentMid;
        public MeshRenderer interiorRenderer;
        public MeshRenderer exteriorRenderer;
        public Collider segmentCollider;
    }
}