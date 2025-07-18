let injectionPromise = null;
let baseUrl = 'https://bastiat.hopto.org:3021';
// TODO: Add injectEndScreenButtons();

const CARD_SELECTOR = [
  'yt-lockup-view-model.ytd-item-section-renderer.lockup',
  '#below  ytd-video-renderer',
  '#primary ytd-video-renderer',
  '#secondary ytd-compact-video-renderer'
].join(',');

const notificationCSS = `
  .yt-save-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #800000;
    color: white;
    font-weight: thick;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 4px 8px rgb(243, 235, 127);
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    max-width: 300px;
    font-size: 14px;
  }
  .yt-save-notification.show {
    opacity: 1;
  }
`;

const styleElement = document.createElement('style');
styleElement.textContent = notificationCSS;
document.head.appendChild(styleElement);

function showNotification(message, duration = 6000) {
  const notification = document.createElement('div');
  notification.className = 'yt-save-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Show notification and hide after a few seconds
  setTimeout(() => notification.classList.add('show'), 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const obs = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        obs.disconnect();
        resolve(node);
      }
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

function logFetch(url, options) {
  const startTime = Date.now();
  console.log('[Fetch] Request:', { url, options, startTime });

  return fetch(url, options)
    .then(response => {
      const endTime = Date.now();
      console.log('[Fetch] Response:', {
        status: response.status,
        statusText: response.statusText,
        timeTaken: `${endTime - startTime}ms`,
        headers: [...response.headers.entries()], // Log headers
      });
      return response.ok ? response.json() : Promise.reject(response);
    })
    .catch(error => {
      console.error('[Fetch] Error:', {
        error: error.name,
        message: error.message,
        stack: error.stack, // For debugging async flows
      });
      throw error; // Re-throw to preserve the original error chain
    });
}

function getCurrentVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

function getCurrentPlayPosition() {
  const video = document.querySelector('video');
  return video ? Math.floor(video.currentTime) : 0;
}

const action = (value) => {
  let message, reqBody;
  const videoid = getCurrentVideoId();
  const time = getCurrentPlayPosition();

  if (value === 0){
    message = `${videoid} saved as unviewed with time ${time}!`
    reqBody = { videoid, time, complete: value, rewatch: 0, viewed: 0, button: 'save' }
  } else if (value === 1) {
    message = `${videoid} saved as watched with timestamp=${time}!`
    reqBody = { videoid, time, complete: value, rewatch: 0, viewed: 1, button: 'watched' }
  }  else if (value === 2){
    message = `${videoid} updated to amount viewed ==> ${time}!`
    reqBody = { videoid, time, complete: value, rewatch: 0, viewed: 2, button: 'update' }
  }

  logFetch(`${baseUrl}/ytsaver/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqBody)
  })
  .then((x) => {
    showNotification(message);
    console.log(x)
  })
  .catch(() => alert(`Error saving id=${url} playtime=${time}`));
}

const actionSuggested = (value, btn) => {
  let message, reqBody;
  const videoid = value.videoid
  const title = value.title

  message = `Saving suggested video ${videoid} ${title}`
  reqBody = { videoid, time: 0, complete: 0, rewatch: 0, viewed: 0, button: 'save' }

  if (btn) {
    btn.textContent = 'Saved!';
    btn.disabled = true;
  }

  logFetch(`${baseUrl}/ytsaver/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqBody)
  })
  .then((x) => {
    showNotification(message);
    console.log(x)
  })
  .catch(() => alert(`Error saving id=${url} playtime=${time}`));
}

function createButton(text, value, onClick) {
  const button = document.createElement('button');
  button.textContent = text;
  button.style.margin = '4px';
  button.style.padding = '6px 10px';
  button.style.borderRadius = '6px';
  button.style.cursor = 'pointer';
  button.style.backgroundColor = '#ff0000';
  button.style.color = '#fff';
  button.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick(value, button);
  };
  return button;
}

function normaliseTarget(raw) {
  // 1. Collection -> first element
  if (raw instanceof HTMLCollection || raw instanceof NodeList) {
    return raw[0] ?? null;
  }
  // 2. Undefined/null -> null
  if (!raw) return null;
  // 3. Anything else we assume is a single node
  return raw;  
}

async function injectMainVideoButtons() {
  if (document.querySelector('#yt-save-watched-buttons')) return;

  if (injectionPromise) return injectionPromise;

  injectionPromise = (async () => {
    const above = await waitForElement('#above-the-fold');
    if (document.querySelector('#yt-save-watched-buttons')) return;

    const container = document.createElement('div');
    container.id = 'yt-save-watched-buttons';
    container.style.marginTop = '10px';  
  
    container.append(
      createButton('💾 Save', 0, action),
      createButton('👀 Watched', 1, action),
      createButton('🔄 Update', 2, action)
    );

    above.insertBefore(container, above.firstChild);
  })().finally(() => {
    injectionPromise = null;
  });

  return injectionPromise;
}

function enhance(card) {
  if (card.dataset.saveEnhanced) return; // skip of already processed
  card.dataset.saveEnhanced = 'true';
  const linkEl = card.querySelector('a[href*="/watch"]');
  if (!linkEl) return;

  const url = linkEl.href
  const videoId = new URL(url, location.origin).searchParams.get('v') ?? '';
  const title = card.querySelector('#video-title, h3, .yt-content-metadata-view-model-wiz__metadata-text')?.textContent.trim() ?? '';

  const meta =
    card.querySelector('.yt-lockup-view-model-wiz__metadata') || // new layout
    card.querySelector('#meta, #dismissible') ||                 // old layouts
    card;

  const btn = createButton('💾 Save', {videoid: videoId, title}, actionSuggested);
  meta.appendChild(btn);
}

document.querySelectorAll(CARD_SELECTOR).forEach(enhance);

const observer = new MutationObserver(muts => {
  muts.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
        if (node.matches?.(CARD_SELECTOR)) {
          enhance(node);
        }
        
        node.querySelectorAll?.(CARD_SELECTOR).forEach(enhance);
    });
  });
  injectMainVideoButtons()
});

observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('yt-navigate-finish', injectMainVideoButtons);
