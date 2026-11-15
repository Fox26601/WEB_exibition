using UnityEngine;

namespace Gallery.Entrance
{
    /// <summary>
    /// Pedestal trigger volume — click/proximity pickup handled by BookletController.
    /// </summary>
    public class PedestalInteractable : MonoBehaviour
    {
        Transform _bookletVisual;
        bool _taken;

        public bool IsTaken => _taken;
        public Transform BookletVisual => _bookletVisual;

        public void Bind(Transform bookletVisual)
        {
            _bookletVisual = bookletVisual;
            _taken = false;
            if (_bookletVisual != null)
                _bookletVisual.gameObject.SetActive(true);
        }

        public void MarkTaken()
        {
            _taken = true;
            if (_bookletVisual != null)
                _bookletVisual.gameObject.SetActive(false);
        }
    }
}
