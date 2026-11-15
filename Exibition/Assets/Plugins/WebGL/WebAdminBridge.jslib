mergeInto(LibraryManager.library, {
  WebAdminBridge_SendPlacements: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
  try {
      if (window.parent && window.parent !== window) {
        var data = JSON.parse(json);
        window.parent.postMessage(
          {
            type: "gallery-admin-placements",
            placements: data.placements || data,
          },
          window.location.origin
        );
      }
    } catch (e) {
      console.warn("WebAdminBridge_SendPlacements", e);
    }
  },
  WebAdminBridge_SendReady: function () {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "gallery-admin-ready" }, window.location.origin);
      }
    } catch (e) {
      console.warn("WebAdminBridge_SendReady", e);
    }
  },
});