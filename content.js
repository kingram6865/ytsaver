let injectionPromise = null;
let baseUrl = 'https://bastiat.hopto.org:3021';

const CARD_SELECTOR = [
  'yt-lockup-view-model.ytd-item-section-renderer.lockup',
  '#below  ytd-video-renderer',
  '#primary ytd-video-renderer',
  '#secondary ytd-compact-video-renderer'
].join(',');


const END_SCREEN_CONTAINER = '.ytp-endscreen-content';
const END_CARD_ANCHOR_SELECTOR = `${END_SCREEN_CONTAINER} a[href*="/watch"]`;
const VIDEO_WALL_CONTAINER = '.ytp-videowall-content, .html5-endscreen';
const VIDEO_WALL_ANCHOR_SELECTOR = `${VIDEO_WALL_CONTAINER} a[href*="/watch"]`;

let styleElement = document.getElementById('yt-saver-styles');
if (!styleElement) {
  styleElement = document.createElement('style');
  styleElement.id = 'yt-saver-styles';
  document.head.appendChild(styleElement);
}

if (!styleElement.textContent.includes('.yt-endsave-btn {')) {
  styleElement.textContent += `
    .yt-endsave-btn {
      position: absolute;
      right: 6px;
      top: auto;
      bottom: auto;
      font-size: 12px;
      padding: 6px 8px;
      border-radius: 6px;
      z-index: 10000;
      pointer-events: auto;
    }
  `;
}

if (!styleElement.textContent.includes('.yt-endsave-btn--bottom-right')) {
  styleElement.textContent += `
    .yt-endsave-btn--bottom-right { bottom: 6px; }
  `;
}

if (!styleElement.textContent.includes('.yt-endsave-btn--top-right')) {
  styleElement.textContent += `
    .yt-endsave-btn--top-right {
      top: 6px;
      .yt-endsave-btn--top-right  { top: 6px; }
    }
  `;
}

if (!styleElement.textContent.includes('.yt-save-notification')) {
  styleElement.textContent += `
    .yt-save-notification {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #800000;
      color: white;
      font-weight: 700;
      padding: 12px 24px;
      border-radius: 4px;
      box-shadow: 0 4px 8px rgb(243 235 127);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      max-width: 300px;
      font-size: 14px;
    }
    .yt-save-notification.show { opacity: 1; }
  `;
}

// styleElement.textContent = notificationCSS;
// document.head.appendChild(styleElement);

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

// Added 2025-09-02
function titleFromEndscreenAnchor(a) {
  return a.querySelector('.ytp-endscreen-title')?.textContent?.trim()
      || a.getAttribute('aria-label')?.split(' by ')[0]?.trim()
      || '';
}

function titleFromVideoWallAnchor(a) {
  return a.querySelector('.ytp-videowall-still-info-title')?.textContent?.trim()
      || a.getAttribute('aria-label')?.split(' by ')[0]?.trim()
      || '';
}

function enhanceEndscreenAnchor(a) {
  if (a.dataset.endSaveEnhanced) return;
  a.dataset.endSaveEnhanced = '1';

  const href = a.getAttribute('href') || '';
  const videoid = new URL(href, location.origin).searchParams.get('v') || '';
  if (!videoid) return;

  const title = titleFromEndscreenAnchor(a);
  const btn = createButton('💾', { videoid, title }, actionSuggested);
  btn.classList.add('yt-endsave-btn');
  btn.title = 'Save this suggested video';

  // Ensure a positioning context so the absolute button lands bottom-right
  if (!/relative|absolute|fixed|sticky/.test(getComputedStyle(a).position)) {
    a.style.position = 'relative';
  }
  a.appendChild(btn);
}

function enhanceVideoWallAnchor(a) {
  if (a.dataset.videoWallEnhanced) return;
  a.dataset.videoWallEnhanced = '1';

  const href = a.getAttribute('href') || '';
  const videoid = new URL(href, location.origin).searchParams.get('v') || '';
  if (!videoid) return;

  const title = titleFromVideoWallAnchor(a);
  const btn = createButton('💾', { videoid, title }, actionSuggested);
  btn.classList.add('yt-endsave-btn');
  btn.classList.add('yt-endsave-btn', 'yt-endsave-btn--top-right');
  btn.title = 'Save this suggested video';

  if (!/relative|absolute|fixed|sticky/.test(getComputedStyle(a).position)) {
    a.style.position = 'relative';
  }
  a.appendChild(btn);
}

function injectEndScreenButtons() {
  const container = document.querySelector(END_SCREEN_CONTAINER);
  if (!container) return;
  container.querySelectorAll(END_CARD_ANCHOR_SELECTOR).forEach(enhanceEndscreenAnchor);
}

// 

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
  } else if (value === 3){
    message = `Checking ${videoid} status...`
    reqBody = { videoid, time, complete: value, rewatch: 0, viewed: 2, button: 'info' }
  }

  logFetch(`${baseUrl}/ytsaver/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqBody)
  })
  .then((x) => {
    // showNotification(message);
    showNotification(x.messages.responseMessage);
    console.log(x.messages.responseMessage)
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
  button.className = 'yt‑saver‑btn';
  button.textContent = text;
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
    // container.style.marginTop = '10px';
    container.className = 'yt‑saver‑btns';
  
    container.append(
      createButton('💾 Save', 0, action),
      createButton('👀 Watched', 1, action),
      createButton('🔄 Update', 2, action),
      createButton('☑️ Check', 3, action)
    );

    above.insertBefore(container, above.firstChild);
  })().finally(() => {
    injectionPromise = null;
  });

  return injectionPromise;
}

function injectVideoWallButtons() {
  // Only proceed if the grid is present
  const grid = document.querySelector(VIDEO_WALL_CONTAINER);
  if (!grid) return;
  grid.querySelectorAll(VIDEO_WALL_ANCHOR_SELECTOR).forEach(enhanceVideoWallAnchor);
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
  injectMainVideoButtons();
  injectVideoWallButtons();
  injectEndScreenButtons();
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('yt-navigate-finish', () => {
  injectMainVideoButtons();
  injectVideoWallButtons();
  injectEndScreenButtons();
});

document.querySelector('video')?.addEventListener('ended', injectEndScreenButtons);
document.querySelector('video')?.addEventListener('timeupdate', () => {
  const v = document.querySelector('video');
  if (v && v.duration && v.currentTime > v.duration - 20) injectEndScreenButtons();
});
