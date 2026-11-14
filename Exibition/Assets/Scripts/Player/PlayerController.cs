using Gallery.Media;
using UnityEngine;

namespace Gallery.Player
{
    /// <summary>
    /// Desktop: WASD/arrows + mouse look with pointer lock.
    /// Mobile: virtual joystick move + look-zone drag (also accepts HTML joystick via jslib hooks).
    /// </summary>
    public class PlayerController : MonoBehaviour
    {
        [SerializeField] float moveSpeed = 3.2f;
        [SerializeField] float lookSensitivity = 0.12f;
        [SerializeField] float mobileLookSensitivity = 0.18f;
        [SerializeField] float pitchMin = -60f;
        [SerializeField] float pitchMax = 70f;
        [SerializeField] float eyeHeight = 1.6f;
        [SerializeField] float radius = 0.28f;

        Camera _camera;
        float _yaw;
        float _pitch;
        bool _mobile;
        bool _pointerLocked;
        Vector2 _htmlMove;
        Vector2 _htmlLookDelta;
        bool _htmlInputActive;
        float _roomLength = 8f;

        // On-screen joystick state (Unity UI fallback when HTML chrome absent).
        Vector2 _uiMove;
        bool _lookDragging;
        Vector2 _lastLookPos;

        public Camera PlayerCamera => _camera;
        public bool InputBlocked { get; set; }

        public void Configure(float roomLength, bool mobile)
        {
            _roomLength = Mathf.Max(Room.RoomBuilder.L0, roomLength);
            _mobile = mobile;
            transform.position = new Vector3(0f, eyeHeight, 1.2f);
            _yaw = 0f;
            _pitch = 0f;
            ApplyLook();
        }

        public void AttachCamera(Camera cam)
        {
            _camera = cam;
            if (_camera == null) return;
            _camera.transform.SetParent(transform, false);
            _camera.transform.localPosition = Vector3.zero;
            _camera.transform.localRotation = Quaternion.identity;
        }

        void Update()
        {
            if (InputBlocked || MediaBridge.OverlayOpen)
                return;

            if (_mobile || _htmlInputActive)
                UpdateMobile();
            else
                UpdateDesktop();
        }

        void UpdateDesktop()
        {
            if (Input.GetMouseButtonDown(0) && !IsPointerOverUi())
                TryLockPointer();

            if (Input.GetKeyDown(KeyCode.Escape))
                UnlockPointer();

            var mx = Input.GetAxisRaw("Horizontal");
            var mz = Input.GetAxisRaw("Vertical");
            // Arrow keys covered by axes; also accept explicit WASD if axes remapped.
            if (Input.GetKey(KeyCode.A)) mx = -1f;
            if (Input.GetKey(KeyCode.D)) mx = 1f;
            if (Input.GetKey(KeyCode.S)) mz = -1f;
            if (Input.GetKey(KeyCode.W)) mz = 1f;

            Move(new Vector2(mx, mz));

            if (_pointerLocked || Input.GetMouseButton(1))
            {
                var dx = Input.GetAxis("Mouse X");
                var dy = Input.GetAxis("Mouse Y");
                Look(dx * lookSensitivity * 10f, -dy * lookSensitivity * 10f);
            }
        }

        void UpdateMobile()
        {
            var move = _htmlInputActive ? _htmlMove : _uiMove;
            Move(move);

            if (_htmlInputActive && _htmlLookDelta.sqrMagnitude > 0f)
            {
                Look(_htmlLookDelta.x * mobileLookSensitivity, _htmlLookDelta.y * mobileLookSensitivity);
                _htmlLookDelta = Vector2.zero;
            }
            else if (!_htmlInputActive)
            {
                UpdateTouchLook();
            }
        }

        void UpdateTouchLook()
        {
            for (var i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                // Right half of screen = look zone.
                if (t.position.x < Screen.width * 0.45f)
                    continue;

                if (t.phase == TouchPhase.Began)
                {
                    _lookDragging = true;
                    _lastLookPos = t.position;
                }
                else if (_lookDragging && (t.phase == TouchPhase.Moved || t.phase == TouchPhase.Stationary))
                {
                    var delta = t.position - _lastLookPos;
                    _lastLookPos = t.position;
                    Look(delta.x * mobileLookSensitivity * 0.15f, -delta.y * mobileLookSensitivity * 0.15f);
                }
                else if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
                {
                    _lookDragging = false;
                }
            }
        }

        void Move(Vector2 input)
        {
            if (input.sqrMagnitude < 0.0001f)
                return;

            input = Vector2.ClampMagnitude(input, 1f);
            var forward = Quaternion.Euler(0f, _yaw, 0f) * Vector3.forward;
            var right = Quaternion.Euler(0f, _yaw, 0f) * Vector3.right;
            var delta = (forward * input.y + right * input.x) * (moveSpeed * Time.deltaTime);
            var next = transform.position + delta;

            var half = Room.RoomBuilder.Width * 0.5f - radius;
            next.x = Mathf.Clamp(next.x, -half, half);
            next.z = Mathf.Clamp(next.z, radius + 0.2f, _roomLength - radius - 0.2f);
            next.y = eyeHeight;
            transform.position = next;
        }

        void Look(float yawDelta, float pitchDelta)
        {
            _yaw += yawDelta;
            _pitch = Mathf.Clamp(_pitch + pitchDelta, pitchMin, pitchMax);
            ApplyLook();
        }

        void ApplyLook()
        {
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            if (_camera != null)
                _camera.transform.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
        }

        void TryLockPointer()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            _pointerLocked = true;
#else
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
            _pointerLocked = true;
#endif
        }

        public void UnlockPointer()
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            _pointerLocked = false;
        }

        static bool IsPointerOverUi()
        {
            return UnityEngine.EventSystems.EventSystem.current != null &&
                   UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
        }

        // --- HTML / jslib joystick bridge ---

        public void SetHtmlMove(float x, float y)
        {
            _htmlInputActive = true;
            _htmlMove = new Vector2(x, y);
        }

        public void AddHtmlLook(float dx, float dy)
        {
            _htmlInputActive = true;
            _htmlLookDelta += new Vector2(dx, dy);
        }

        public void SetUiMove(float x, float y)
        {
            _uiMove = new Vector2(x, y);
        }

        public void ClearHtmlInput()
        {
            _htmlInputActive = false;
            _htmlMove = Vector2.zero;
            _htmlLookDelta = Vector2.zero;
        }
    }
}
