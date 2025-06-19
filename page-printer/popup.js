document.getElementById("savePdf").addEventListener("click", async () => {
  const select = document.getElementById("employeeSelect");
  const empCode = select.value;
  if (!empCode) {
    alert("Please select an employee before saving PDF.");
    return;
  }

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Send message to content script to get profile name and set title
  chrome.tabs.sendMessage(tab.id, { command: "getProfileName" }, (response) => {
    const profileNameRaw = response?.profileName || "Unknown";
    // Sanitize name to remove spaces etc.
    const profileName = profileNameRaw.replace(/\s+/g, '');

    const newTitle = `${empCode}_${profileName}`;

    // Set the custom title and then print
    chrome.tabs.sendMessage(tab.id, { command: "setCustomTitle", title: newTitle }, () => {
      // Trigger print dialog after title change
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.print()
      });
    });
  });

  alert("Print dialog opened. Suggested filename will be:\n" + empCode + "_ProfileName.pdf");
});
