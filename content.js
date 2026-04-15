// Content script - extracts all images from the current page
(function () {
  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractImages") {
      const images = extractAllImages();
      sendResponse({ images });
    } else if (request.action === "deepScan") {
      // Deep scan: auto-scroll and extract iteratively
      deepScan(request.scrollCount, request.scrollDelay, sendResponse);
      return true; // Keep channel open for async
    } else if (request.action === "stopDeepScan") {
      stopDeepScanFlag = true;
      sendResponse({ stopped: true });
    }
    return true; // Keep message channel open for async response
  });

  let stopDeepScanFlag = false;

  async function deepScan(scrollCount, scrollDelay, sendResponse) {
    stopDeepScanFlag = false;
    const imageSet = new Set();
    const allImages = [];

    for (let i = 0; i < scrollCount; i++) {
      if (stopDeepScanFlag) break;

      // Extract current visible images
      const currentImages = extractAllImages();
      let newCount = 0;
      currentImages.forEach((img) => {
        if (!imageSet.has(img.src)) {
          imageSet.add(img.src);
          allImages.push(img);
          newCount++;
        }
      });

      // Send progress update via runtime message (popup listens)
      try {
        chrome.runtime.sendMessage({
          action: "deepScanProgress",
          current: i + 1,
          total: scrollCount,
          imageCount: allImages.length,
          newInThisScroll: newCount,
        });
      } catch (e) {
        // Popup may have closed
      }

      // Scroll down
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });

      // Wait for content to load
      await new Promise((resolve) => setTimeout(resolve, scrollDelay));
    }

    // Final extraction after last scroll
    const finalImages = extractAllImages();
    finalImages.forEach((img) => {
      if (!imageSet.has(img.src)) {
        imageSet.add(img.src);
        allImages.push(img);
      }
    });

    sendResponse({ images: allImages, total: allImages.length });
  }

  function extractAllImages() {
    const imageSet = new Set();
    const images = [];

    // 1. Get all <img> elements
    document.querySelectorAll("img").forEach((img) => {
      const src = getAbsoluteUrl(img.src || img.dataset.src || img.dataset.lazySrc);
      if (src && !imageSet.has(src) && isValidImage(src)) {
        imageSet.add(src);
        images.push({
          src: src,
          alt: img.alt || "",
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          type: getImageType(src),
        });
      }
    });

    // 2. Get background images from CSS
    document.querySelectorAll("*").forEach((el) => {
      const style = window.getComputedStyle(el);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== "none") {
        const urls = bgImage.match(/url\(["']?(.*?)["']?\)/g);
        if (urls) {
          urls.forEach((urlMatch) => {
            const url = urlMatch.replace(/url\(["']?/, "").replace(/["']?\)/, "");
            const absUrl = getAbsoluteUrl(url);
            if (absUrl && !imageSet.has(absUrl) && isValidImage(absUrl)) {
              imageSet.add(absUrl);
              images.push({
                src: absUrl,
                alt: "Background Image",
                width: 0,
                height: 0,
                type: getImageType(absUrl),
              });
            }
          });
        }
      }
    });

    // 3. Get images from <picture> and <source> elements
    document.querySelectorAll("picture source").forEach((source) => {
      const srcset = source.srcset;
      if (srcset) {
        srcset.split(",").forEach((entry) => {
          const url = entry.trim().split(" ")[0];
          const absUrl = getAbsoluteUrl(url);
          if (absUrl && !imageSet.has(absUrl) && isValidImage(absUrl)) {
            imageSet.add(absUrl);
            images.push({
              src: absUrl,
              alt: "Picture Source",
              width: 0,
              height: 0,
              type: getImageType(absUrl),
            });
          }
        });
      }
    });

    // 4. Get images from <video> poster attributes
    document.querySelectorAll("video[poster]").forEach((video) => {
      const src = getAbsoluteUrl(video.poster);
      if (src && !imageSet.has(src) && isValidImage(src)) {
        imageSet.add(src);
        images.push({
          src: src,
          alt: "Video Poster",
          width: 0,
          height: 0,
          type: getImageType(src),
        });
      }
    });

    // 5. Get SVG elements as data URLs
    document.querySelectorAll("svg").forEach((svg) => {
      // Only get significant SVGs (not tiny icons)
      if (svg.getBoundingClientRect().width > 30 && svg.getBoundingClientRect().height > 30) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);
        // We can't use blob URLs across contexts, so we encode as data URL
        const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
        if (!imageSet.has(dataUrl)) {
          imageSet.add(dataUrl);
          images.push({
            src: dataUrl,
            alt: "SVG Image",
            width: Math.round(svg.getBoundingClientRect().width),
            height: Math.round(svg.getBoundingClientRect().height),
            type: "svg",
          });
        }
      }
    });

    return images;
  }

  function getAbsoluteUrl(url) {
    if (!url) return null;
    if (url.startsWith("data:")) return url;
    if (url.startsWith("blob:")) return null;
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return null;
    }
  }

  function isValidImage(url) {
    if (!url) return false;
    if (url.startsWith("data:image/")) return true;
    // Filter out tracking pixels, spacers, etc.
    const invalidPatterns = [
      "1x1",
      "pixel",
      "tracking",
      "beacon",
      "spacer",
      "blank.gif",
      "transparent.gif",
    ];
    const lowerUrl = url.toLowerCase();
    return !invalidPatterns.some((p) => lowerUrl.includes(p));
  }

  function getImageType(url) {
    if (!url) return "unknown";
    if (url.startsWith("data:image/svg")) return "svg";
    if (url.startsWith("data:image/png")) return "png";
    if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
    if (url.startsWith("data:image/gif")) return "gif";
    if (url.startsWith("data:image/webp")) return "webp";
    if (url.startsWith("data:")) return "unknown";

    const extension = url.split("?")[0].split("#")[0].split(".").pop().toLowerCase();
    const typeMap = {
      jpg: "jpg",
      jpeg: "jpg",
      png: "png",
      gif: "gif",
      webp: "webp",
      svg: "svg",
      bmp: "bmp",
      ico: "ico",
      avif: "avif",
    };
    return typeMap[extension] || "unknown";
  }
})();
