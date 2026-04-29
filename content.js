let injectionPromise = null;
let baseUrl = 'https://bastiat.hopto.org:3021';
const BASEURL_KEY = 'ytsaver_baseUrl';

// ------ Added 2025-09-02 baseUrl configuration
const baseUrlListeners = [];
function onBaseUrlChange(fn) {
  if (typeof fn === 'function') baseUrlListeners.push(fn);
}

function emitBaseUrlChange() {
  for (const fn of baseUrlListeners) {
    try { fn(baseUrl); } catch (e) { console.warn('[YT Saver] baseUrl listener error:', e); }
  }
}

// ---------------------

let enhanceSweepTimer = null;
let enhanceSweepStopTimer = null;

function scheduleEnhanceSweep() {
  clearTimeout(enhanceSweepTimer);

  enhanceSweepTimer = setTimeout(() => {
    enhanceAllCards();
  }, 150);

  clearTimeout(enhanceSweepStopTimer);

  enhanceSweepStopTimer = setTimeout(() => {
    clearTimeout(enhanceSweepTimer);
    enhanceSweepTimer = null;
  }, 12000);
}

const CARD_SELECTOR = [
  'ytd-rich-grid-media',
  'ytd-rich-item-renderer #content',
  'yt-lockup-view-model',
  '#below  ytd-video-renderer',
  '#primary ytd-video-renderer',
  '#secondary ytd-compact-video-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'yt-lockup-view-model.ytd-watch-next-secondary-results-renderer.lockup', // Added 2025 12 06 0058
  '.yt-lockup-view-model-wiz' // Added 2025 12 06 0058
].join(',');


const END_SCREEN_CONTAINER = '.ytp-endscreen-content, .html5-endscreen';
const END_CARD_SELECTOR = [
  '.ytp-endscreen-content a[href*="/watch"]',
  '.html5-endscreen a[href*="/watch"]',
  '.ytp-ce-element a[href*="/watch"]',
  '.ytp-ce-video a[href*="/watch"]',
  'a.ytp-ce-covering-overlay[href*="/watch"]',
  'a.ytp-modern-videowall-still[href*="/watch"]'
].join(',');


const VIDEO_WALL_CONTAINER = [
  '.ytp-videowall-content',
  '.html5-endscreen',
  '.ytp-fullscreen-grid-main-content',
  '.ytp-fullscreen-grid-stills-container'
].join(',');

const VIDEO_WALL_ANCHOR_SELECTOR = [
  '.ytp-videowall-content a[href*="/watch"]',
  '.html5-endscreen a[href*="/watch"]',
  '.ytp-fullscreen-grid-main-content a.ytp-modern-videowall-still[href*="/watch"]',
  '.ytp-fullscreen-grid-stills-container a.ytp-modern-videowall-still[href*="/watch"]'
].join(',');

let styleElement = document.getElementById('yt-saver-styles');

if (!styleElement) {
  styleElement = document.createElement('style');
  styleElement.id = 'yt-saver-styles';
  document.head.appendChild(styleElement);
}

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
      || a.querySelector('.ytp-modern-videowall-still-info-title')?.textContent?.trim()
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
  btn.classList.add('yt-endsave-btn', 'yt-endsave-btn--check');
  btn.title = 'Save this suggested video';
  a.classList.add('yt-endsave-anchor');

  a.appendChild(btn);
}

function enhanceVideoWallAnchor(a) {
  if (a.dataset.videoWallEnhanced) return;
  a.dataset.videoWallEnhanced = '1';

  const href = a.getAttribute('href') || '';
  const videoid = new URL(href, location.origin).searchParams.get('v') || '';
  if (!videoid) return;

  const title = titleFromVideoWallAnchor(a);
  const saveBtn = createButton('💾', { videoid, title }, actionSuggested);
  saveBtn.classList.add('yt-endsave-btn', 'yt-endsave-btn--save');
  // saveBtn.classList.add('yt-endsave-btn', 'yt-endsave-btn--top-right');
  saveBtn.classList.add('yt-endsave-btn');
  saveBtn.title = 'Save this suggested video';

  const checkBtn = createButton('☑️', { videoid, title }, checkSuggested);
  checkBtn.classList.add('yt-endsave-btn', 'yt-endsave-btn--check');
  checkBtn.title = 'Check status of this video';

  const cs = getComputedStyle(a);
  if (cs.position === 'static') {
    a.style.position = 'relative';
  }

  Object.assign(saveBtn.style, {
    position: 'absolute',
    top: '6px',
    right: '46px',      // shift left a bit so Check can sit on the far right
    zIndex: '10000'
  });

  Object.assign(checkBtn.style, {
    position: 'absolute',
    top: '6px',
    right: '6px',
    zIndex: '10000'
  });

  a.appendChild(saveBtn);
  a.appendChild(checkBtn);

}

// UPDATED [2026-04-28 1500 PDT]: query the document because the newer 3-card endscreen may not nest
// anchors under only .ytp-endscreen-content
function injectEndScreenButtons() {
  document.querySelectorAll(END_CARD_SELECTOR).forEach(enhanceEndscreenAnchor);
}

// ------ baseUrl config
function normalizeBaseUrl(input) {
  if (!input) return null;
  let raw = String(input).trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, ''); // keep optional path, no trailing slash
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

function shortHost(u) {
  try { return new URL(u).host; } catch { return u; }
}

function setServerButtonLabel(el) {
  if (!el) return;
  el.textContent = `⚙ ${shortHost(baseUrl)}`;
  el.title = `Server base URL: ${baseUrl}\nClick to change…`;
}

function updateServerBadgeLabel() {
  const el = document.getElementById('yt-server-button');
  setServerButtonLabel(el);
}

function loadBaseUrl() {
  if (!chrome || !chrome.storage || !chrome.storage.local) {
    console.warn('[YT Saver] chrome.storage unavailable; using default baseUrl:', baseUrl);
    emitBaseUrlChange();
    updateServerBadgeLabel();
    return;
  }
  chrome.storage.local.get([BASEURL_KEY], (data) => {
    const stored = data && data[BASEURL_KEY];
    if (stored) baseUrl = stored;
    emitBaseUrlChange();
    updateServerBadgeLabel();
    console.log('[YT Saver] Loaded baseUrl:', baseUrl);
  });
}

function saveBaseUrl(newValue) {
  if (!chrome || !chrome.storage || !chrome.storage.local) {
    baseUrl = newValue;
    emitBaseUrlChange();
    updateServerBadgeLabel();
    showNotification(`Server set to ${baseUrl}`);
    return;
  }
  chrome.storage.local.set({ [BASEURL_KEY]: newValue }, () => {
    baseUrl = newValue;
    emitBaseUrlChange();
    updateServerBadgeLabel();
    showNotification(`Server set to ${baseUrl}`);
    console.log('[YT Saver] Saved baseUrl:', baseUrl);
  });
}

function setBaseUrlFromPrompt() {
  const current = baseUrl || '';
  const input = prompt('Enter server base URL (e.g. https://host:3021 or https://host:3021/api)', current);
  if (input == null) return;
  const normalized = normalizeBaseUrl(input);
  if (!normalized) {
    showNotification('Invalid URL. Please include http:// or https://');
    return;
  }
  saveBaseUrl(normalized);
}

loadBaseUrl();

function createServerButton() {
  const btn = document.createElement('button');
  btn.id = 'yt-server-button';
  btn.className = 'yt-saver-settings';
  btn.type = 'button';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setBaseUrlFromPrompt();
  });

  setServerButtonLabel(btn);          // initial label
  onBaseUrlChange(() => setServerButtonLabel(btn)); // live updates when baseUrl changes
  return btn;
}

function renderServerButton(container) {
  if (!container || !container.append) return;
  let btn = container.querySelector('#yt-server-button');
  if (!btn) {
    btn = createServerButton();
    container.append(btn);
  } else {
    setServerButtonLabel(btn);
  }
}


// -------------------------------------------------

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

const checkSuggested = (value, btn) => {
  const { videoid, title } = value;

  const message = `Checking status for suggested video ${videoid} ${title}`;
  const reqBody = {
    videoid,
    time: 0,
    complete: 3,
    rewatch: 0,
    viewed: 0,
    button: 'info'
  };

  if (btn) {
    btn.textContent = '…';
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
      const responseMsg = x?.messages?.responseMessage || message;
      showNotification(responseMsg);
      console.log(x);
    })
    .catch((err) => {
      alert(`Error checking id=${videoid}`);
      console.error(err);
    })
    .finally(() => {
      if (btn) {
        btn.textContent = '☑️ Check';
        btn.disabled = false;
      }
    });
};

function createButton(text, value, onClick) {
  const button = document.createElement('button');
  button.className = 'yt-saver-btn';
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
    container.className = 'yt-saver-btns';

    container.append(
      createButton('💾 Save', 0, action),
      createButton('👀 Watched', 1, action),
      createButton('🔄 Update', 2, action),
      createButton('☑️ Check', 3, action)
    );

    renderServerButton(container);

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
  const existingButtons = card.querySelector('.yt-saver-btns');

  if (card.dataset.saveEnhanced && existingButtons) return;

  if (card.dataset.saveEnhanced && !existingButtons) {
    delete card.dataset.saveEnhanced;
  }

  const isLockup = card.matches?.('yt-lockup-view-model');

  const linkEl = isLockup
    ? card.querySelector('a.ytLockupMetadataViewModelTitle[href*="/watch"]')
    : card.querySelector('a[href*="/watch"]');

  if (!linkEl) return;

  const meta = isLockup
    ? card.querySelector('.ytLockupMetadataViewModelTextContainer')
    : (
      card.querySelector('.ytLockupViewModelMetadata') ||
      card.querySelector('.yt-lockup-view-model-wiz__metadata') ||
      card.querySelector('#meta, #dismissible') ||
      card
    );

  if (!meta) return;

  if (meta.querySelector(':scope > .yt-saver-btns')) {
    card.dataset.saveEnhanced = 'true';
    return;
  }

  const url = linkEl.href
  const videoId = new URL(url, location.origin).searchParams.get('v') ?? '';
  if (!videoId) return;

  const title =
    card.querySelector('a.ytLockupMetadataViewModelTitle span')?.textContent?.trim() ||
    card.querySelector('h3[title]')?.getAttribute('title')?.trim() ||
    card.querySelector('#video-title, h3, .yt-content-metadata-view-model-wiz__metadata-text')?.textContent.trim() ||
    '';

  const btn1 = createButton('💾 Save', {videoid: videoId, title}, actionSuggested);
  const btn2 = createButton('☑️ Check', {videoid: videoId, title}, checkSuggested);

  const btnWrapper = document.createElement('div');
  btnWrapper.className = 'yt-saver-btns';
  btnWrapper.append(btn1, btn2);

  // if (meta.append) {
  //   meta.append(btnWrapper);
  // } else {
  //   meta.appendChild(btnWrapper);
  // }
  meta.append(btnWrapper);
  card.dataset.saveEnhanced = 'true';
}

function enhanceAllCards() {
  document.querySelectorAll(CARD_SELECTOR).forEach(enhance);
}

// setInterval(enhanceAllCards, 1000);

const observer = new MutationObserver(muts => {
  let shouldSweep = false;

  muts.forEach(m => {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;

        if (node.matches?.(CARD_SELECTOR) || node.querySelector?.(CARD_SELECTOR)) {
          shouldSweep = true;
        }
        // node.querySelectorAll?.(CARD_SELECTOR).forEach(enhance);
    });
  });

  if (shouldSweep) {
    scheduleEnhanceSweep();
  }

  injectMainVideoButtons();
  injectVideoWallButtons();
  injectEndScreenButtons();
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('yt-navigate-finish', () => {
  enhanceAllCards();
  scheduleEnhanceSweep();
  injectMainVideoButtons();
  injectVideoWallButtons();
  injectEndScreenButtons();
  // setTimeout(enhanceAllCards, 250);
  // setTimeout(enhanceAllCards, 1000);
});

document.querySelector('video')?.addEventListener('ended', injectEndScreenButtons);
document.querySelector('video')?.addEventListener('timeupdate', () => {
  const v = document.querySelector('video');
  if (v && v.duration && v.currentTime > v.duration - 20) injectEndScreenButtons();
});
