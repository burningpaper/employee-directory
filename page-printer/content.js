chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "getProfileName") {
    const nameEl = document.querySelector(".text-heading-xlarge") || document.querySelector("h1");
    const profileName = nameEl ? nameEl.innerText.trim() : "Unknown";
    sendResponse({ profileName });
  } else if (request.command === "setCustomTitle") {
    if (request.title) {
      const desiredTitle = request.title;

      // Inject code into the page context to override document.title setter
      const scriptContent = `
        (function() {
          let _title = "${desiredTitle}";
          Object.defineProperty(document, 'title', {
            get() { return _title; },
            set(newTitle) { /* ignore LinkedIn's attempts to set title */ },
            configurable: true
          });
          // Also immediately set title to desiredTitle
          document.title = _title;
        })();
      `;

      const script = document.createElement('script');
      script.textContent = scriptContent;
      (document.head || document.documentElement).appendChild(script);
      script.remove();

      sendResponse({ success: true });
    }
  }
  return true;
});
