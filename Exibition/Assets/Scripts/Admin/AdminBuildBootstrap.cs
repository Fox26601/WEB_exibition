using Gallery.Catalog;
using Gallery.Entrance;
using Gallery.Player;
using Gallery.Room;
using Gallery.UI;
using UnityEngine;

namespace Gallery.Admin
{
  /// <summary>
  /// Enables Sims camera, placement tools, and disables visitor controls when AdminBuildMode is active.
  /// </summary>
  public static class AdminBuildBootstrap
  {
    public static void Enable(
      Camera camera,
      PlayerController player,
      RoomBuilder room,
      ArtworkSpawner spawner,
      CatalogData catalog,
      BookletController booklet,
      LocaleUI locale,
      InteractionRaycaster raycaster)
    {
      if (player != null)
      {
        player.InputBlocked = true;
        player.enabled = false;
      }

      if (booklet != null) booklet.enabled = false;
      if (locale != null) locale.enabled = false;
      if (raycaster != null) raycaster.enabled = false;

      var camGo = new GameObject("AdminSimsCamera");
      var sims = camGo.AddComponent<AdminSimsCamera>();
      sims.Initialize(room);

      if (camera != null && camera.transform.parent == player.transform)
        camera.transform.SetParent(null, true);
      if (camera != null)
      {
        camera.transform.SetParent(camGo.transform, false);
        camera.transform.localPosition = Vector3.zero;
        camera.transform.localRotation = Quaternion.identity;
      }

      var bridgeGo = new GameObject("WebAdminBridge");
      var bridge = bridgeGo.AddComponent<WebAdminBridge>();

      var placementGo = new GameObject("AdminPlacement");
      var placement = placementGo.AddComponent<AdminPlacementController>();
      placement.Initialize(room, spawner, catalog, bridge, camera);
      bridge.Wire(placement);

      if (catalog?.layout != null)
        placement.ApplyLayout(catalog.layout);
    }
  }
}