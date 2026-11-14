mergeInto(LibraryManager.library, {
  MediaBridge_OpenImage: function (urlPtr) {
    var url = UTF8ToString(urlPtr);
    var root = document.getElementById('gallery-media-overlay');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gallery-media-overlay';
      root.setAttribute('style',
        'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);' +
        'display:flex;align-items:center;justify-content:center;');
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    root.style.display = 'flex';

    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.setAttribute('style', 'max-width:100%;max-height:100%;object-fit:contain;');
    root.appendChild(img);

    var close = function () {
      root.style.display = 'none';
      root.innerHTML = '';
      try {
        if (typeof unityInstance !== 'undefined' && unityInstance) {
          unityInstance.SendMessage('MediaBridge', 'OnJsOverlayClosed');
        } else if (typeof Module !== 'undefined' && Module.SendMessage) {
          Module.SendMessage('MediaBridge', 'OnJsOverlayClosed');
        }
      } catch (e) {}
      root.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
    var onKey = function (ev) {
      if (ev.key === 'Escape') close();
    };
    root.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  },

  MediaBridge_OpenVideo: function (urlPtr, posterPtr) {
    var url = UTF8ToString(urlPtr);
    var poster = UTF8ToString(posterPtr);
    var root = document.getElementById('gallery-media-overlay');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gallery-media-overlay';
      root.setAttribute('style',
        'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);' +
        'display:flex;align-items:center;justify-content:center;');
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    root.style.display = 'flex';

    var video = document.createElement('video');
    video.src = url;
    if (poster) video.poster = poster;
    video.controls = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('style', 'max-width:100%;max-height:100%;');
    root.appendChild(video);
    var playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(function () {});

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute('style',
      'position:absolute;top:12px;right:12px;padding:8px 14px;font:14px sans-serif;');
    root.appendChild(closeBtn);

    var closed = false;
    var close = function () {
      if (closed) return;
      closed = true;
      try { video.pause(); } catch (e) {}
      root.style.display = 'none';
      root.innerHTML = '';
      try {
        if (typeof unityInstance !== 'undefined' && unityInstance) {
          unityInstance.SendMessage('MediaBridge', 'OnJsOverlayClosed');
        } else if (typeof Module !== 'undefined' && Module.SendMessage) {
          Module.SendMessage('MediaBridge', 'OnJsOverlayClosed');
        }
      } catch (e) {}
      document.removeEventListener('keydown', onKey);
    };
    var onKey = function (ev) {
      if (ev.key === 'Escape') close();
    };
    closeBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      close();
    });
    document.addEventListener('keydown', onKey);
  },

  MediaBridge_Close: function () {
    var root = document.getElementById('gallery-media-overlay');
    if (!root) return;
    var video = root.querySelector('video');
    if (video) {
      try { video.pause(); } catch (e) {}
    }
    root.style.display = 'none';
    root.innerHTML = '';
  }
});
