using Gallery.Room;
using UnityEngine;

namespace Gallery.Admin
{
    /// <summary>
    /// Fixed isometric pan/zoom for admin build mode. Alt+LMB orbits; RMB pans.
    /// </summary>
    public class AdminSimsCamera : MonoBehaviour
    {
        [SerializeField] float panSensitivity = 0.012f;
        [SerializeField] float zoomSensitivity = 1.8f;
        [SerializeField] float minPitch = 28f;
        [SerializeField] float maxPitch = 68f;
        [SerializeField] float minDistance = 4f;
        [SerializeField] float maxDistance = 80f;
        [SerializeField] float orbitSensitivity = 0.35f;

        Transform _pivot;
        float _yaw = 35f;
        float _pitch = 44f;
        float _distance = 22f;
        Vector3 _panOffset;

        public void Initialize(RoomBuilder room)
        {
            var center = Vector3.zero;
            if (room != null && room.TryGetLayoutCenter(out var c))
                center = c;
            else
                center = new Vector3(0f, 0f, room != null ? room.Length * 0.5f : 6f);

            _pivot = new GameObject("AdminCameraPivot").transform;
            _pivot.position = center;
            transform.SetParent(_pivot, false);
            ApplyTransform();
        }

        void LateUpdate()
        {
            if (_pivot == null) return;

            var pan =
                Input.GetMouseButton(1) ||
                Input.GetMouseButton(2) ||
                (Input.GetKey(KeyCode.Space) && Input.GetMouseButton(0));

            if (pan)
            {
                var dx = Input.GetAxis("Mouse X");
                var dz = Input.GetAxis("Mouse Y");
                _panOffset += (_pivot.right * -dx + _pivot.forward * -dz) * panSensitivity * _distance;
            }

            var altHeld = Input.GetKey(KeyCode.LeftAlt) || Input.GetKey(KeyCode.RightAlt);
            var orbit =
                Input.GetMouseButton(0) &&
                altHeld &&
                !Input.GetKey(KeyCode.Space) &&
                !AdminPlacementController.BlocksCameraInput;

            if (orbit)
            {
                _yaw += Input.GetAxis("Mouse X") * orbitSensitivity;
                _pitch -= Input.GetAxis("Mouse Y") * orbitSensitivity;
                _pitch = Mathf.Clamp(_pitch, minPitch, maxPitch);
            }

            var scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.001f)
            {
                _distance = Mathf.Clamp(_distance - scroll * zoomSensitivity, minDistance, maxDistance);
            }

            ApplyTransform();
        }

        void ApplyTransform()
        {
            var pivotPos = _pivot.position + _panOffset;
            var rot = Quaternion.Euler(_pitch, _yaw, 0f);
            transform.rotation = rot;
            transform.position = pivotPos - rot * Vector3.forward * _distance;
        }
    }
}