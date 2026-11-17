using Gallery.Catalog;
using Gallery.Room;
using NUnit.Framework;

namespace Gallery.EditorTests
{
    public class RoomOverlapClipEditorTests
    {
        [Test]
        public void WallSpans_Drop_When_Midpoint_Inside_Other_Room()
        {
            var layout = new GalleryLayoutData
            {
                rooms = new[]
                {
                    new GalleryRoomData
                    {
                        id = "hex",
                        shape = "hexagon",
                        transform = new RoomTransformData { x = 0f, z = 2f, rotation = 0f, scaleX = 2.8f, scaleZ = 2.8f },
                    },
                    new GalleryRoomData
                    {
                        id = "sq",
                        shape = "square",
                        transform = new RoomTransformData { x = 0.5f, z = 1.8f, rotation = 45f, scaleX = 2.2f, scaleZ = 2.2f },
                    },
                },
            };

            var rooms = RoomOverlapClip.BuildOverlapRooms(layout);
            var removed = 0;
            for (var e = 0; e < 4; e++)
            {
                var s = RoomOverlapClip.WallSpansForEdge(rooms, "sq", e);
                if (s.Count == 0) removed++;
            }

            Assert.That(removed, Is.GreaterThan(0));
        }

        [Test]
        public void ShouldKeepFloorTriangle_Keeps_Outer_Overlap_When_Inner_Has_Lower_Id()
        {
            var layout = new GalleryLayoutData
            {
                rooms = new[]
                {
                    new GalleryRoomData
                    {
                        id = "alpha",
                        shape = "square",
                        transform = new RoomTransformData { x = 0f, z = 0f, rotation = 0f, scaleX = 6f, scaleZ = 6f },
                    },
                    new GalleryRoomData
                    {
                        id = "zoo",
                        shape = "square",
                        transform = new RoomTransformData { x = 0f, z = 0f, rotation = 0f, scaleX = 2.5f, scaleZ = 2.5f },
                    },
                },
            };

            var rooms = RoomOverlapClip.BuildOverlapRooms(layout);
            var inner = RoomBuilder.ResolveRoomVertices(layout.rooms[1]);
            var cx = (inner[0].x + inner[1].x + inner[2].x) / 3f;
            var cz = (inner[0].z + inner[1].z + inner[2].z) / 3f;
            var centroid = new Vector3(cx, 0f, cz);

            Assert.That(
                RoomOverlapClip.ShouldKeepFloorTriangle(rooms, "alpha", centroid),
                Is.True,
                "outer floor must remain where a lower-id room sits inside");
        }

        [Test]
        public void WallSpans_Dedup_Coplanar_Shared_Edge_By_Room_Id()
        {
            static Vec2Data V(float x, float z) => new Vec2Data { x = x, z = z };

            var layout = new GalleryLayoutData
            {
                rooms = new[]
                {
                    new GalleryRoomData
                    {
                        id = "roomA",
                        vertices = new[] { V(0f, 0f), V(2f, 0f), V(2f, 2f), V(0f, 2f) },
                    },
                    new GalleryRoomData
                    {
                        id = "roomB",
                        vertices = new[] { V(2f, 0f), V(4f, 0f), V(4f, 2f), V(2f, 2f) },
                    },
                },
            };

            var rooms = RoomOverlapClip.BuildOverlapRooms(layout);
            var sharedOnA = RoomOverlapClip.WallSpansForEdge(rooms, "roomA", 1);
            var sharedOnB = RoomOverlapClip.WallSpansForEdge(rooms, "roomB", 3);

            Assert.That(sharedOnA.Count, Is.EqualTo(1), "lower-id room keeps the shared wall");
            Assert.That(sharedOnB.Count, Is.EqualTo(0), "higher-id room must not duplicate coplanar wall");
        }

        [Test]
        public void WallSpans_Drop_SubSpans_Shorter_Than_MinSpan()
        {
            static Vec2Data V(float x, float z) => new Vec2Data { x = x, z = z };

            var layout = new GalleryLayoutData
            {
                rooms = new[]
                {
                    new GalleryRoomData
                    {
                        id = "solo",
                        vertices = new[] { V(0f, 0f), V(4f, 0f), V(4f, 4f), V(0f, 4f) },
                    },
                    new GalleryRoomData
                    {
                        id = "hex",
                        shape = "hexagon",
                        transform = new RoomTransformData { x = 2f, z = 2f, rotation = 0f, scaleX = 3f, scaleZ = 3f },
                    },
                },
            };

            var rooms = RoomOverlapClip.BuildOverlapRooms(layout);
            var tiny = 0;
            foreach (var edge in new[] { 0, 1, 2, 3 })
            {
                var spans = RoomOverlapClip.WallSpansForEdge(rooms, "solo", edge);
                for (var i = 0; i < spans.Count; i++)
                {
                    var s = spans[i];
                    if ((s.t1 - s.t0) * 4f < RoomOverlapClip.MinSpan) tiny++;
                }
            }

            Assert.That(tiny, Is.EqualTo(0));
        }
    }
}