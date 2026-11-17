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
    }
}