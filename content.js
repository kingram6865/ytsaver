let baseUrl = 'https://bastiat.hopto.org:3021';

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
  const url = getCurrentVideoId();
  const time = getCurrentPlayPosition();
  // alert(`url: ${url} time: ${time} status: ${value}`)
  logFetch(`${baseUrl}/ytsaver/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, time, complete: value })
  })
  .then(res => (res.status === 200) ? res.json() : Promise.reject())
  .then(() => alert('Saved with timestamp!'))
  .catch(() => alert(`Error saving id=(${url}) playtime=${time}`));
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
    onClick(value);
  };
  return button;
}

function injectMainVideoButtons() {
  if (document.querySelector('#yt-save-watched-buttons')) return;

  const container = document.createElement('div');
  container.id = 'yt-save-watched-buttons';
  container.style.marginTop = '10px';  

  // const saveButton = createButton('💾 Save', false, (value) => { 
  //   alert(`Pressed Save Button value is ${value}`)
  // });

  // const watchedButton = createButton('👀 Watched', true, (value) => {
  //   alert(`Pressed the Watched button value is ${value}`)
  // });

  const saveButton = createButton('💾 Save', false, action);

  const watchedButton = createButton('👀 Watched', true, action);

  container.appendChild(saveButton);
  container.appendChild(watchedButton);
  
  const targetParent = document.querySelector('#above-the-fold #title');
  const target = targetParent.querySelector(':nth-child(2)');

  if (target) {
    target.before(container);
  } else {
    console.error("Target element not found!");
  }
}

const observer = new MutationObserver(() => {
  injectMainVideoButtons()
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', () => {
  injectMainVideoButtons();
  // injectEndScreenButtons();
  // injectSuggestedVideoButtons();
});
