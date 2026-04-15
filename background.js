// Background service worker - handles downloads
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "downloadImage") {
    downloadImage(request.url, request.filename);
    sendResponse({ success: true });
  } else if (request.action === "downloadAll") {
    downloadAllImages(request.images, request.folderName);
    sendResponse({ success: true });
  }
  return true;
});

async function downloadImage(url, filename) {
  try {
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
    });
  } catch (error) {
    console.error("Download failed:", error);
  }
}

async function downloadAllImages(images, folderName) {
  const sanitizedFolder = folderName.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const ext = img.type && img.type !== "unknown" ? img.type : "jpg";
    const filename = `${sanitizedFolder}/image_${String(i + 1).padStart(3, "0")}.${ext}`;

    try {
      await chrome.downloads.download({
        url: img.src,
        filename: filename,
        saveAs: false,
      });
      // Small delay to avoid overwhelming the download manager
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Failed to download image ${i + 1}:`, error);
    }
  }
}
