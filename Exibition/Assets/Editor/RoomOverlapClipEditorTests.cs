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
    }
}