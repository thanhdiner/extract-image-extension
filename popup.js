// Popup script - manages the UI and interactions
document.addEventListener("DOMContentLoaded", () => {
  const imageGrid = document.getElementById("imageGrid");
  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const imageCount = document.getElementById("imageCount");
  const selectedInfo = document.getElementById("selectedInfo");
  const totalInfo = document.getElementById("totalInfo");
  const selectAllBtn = document.getElementById("selectAll");
  const downloadBtn = document.getElementById("downloadSelected");
  const copyBtn = document.getElementById("copySelected");
  const minWidthSelect = document.getElementById("minWidth");
  const imageTypeSelect = document.getElementById("imageType");

  // Deep Scan elements
  const deepScanSwitch = document.getElementById("deepScanSwitch");
  const deepScanConfig = document.getElementById("deepScanConfig");
  const scrollCountSelect = document.getElementById("scrollCount");
  const scrollDelaySelect = document.getElementById("scrollDelay");
  const startDeepScanBtn = document.getElementById("startDeepScan");
  const deepScanProgress = document.getElementById("deepScanProgress");
  const progressDetail = document.getElementById("progressDetail");
  const progressCount = document.getElementById("progressCount");
  const stopDeepScanBtn = document.getElementById("stopDeepScan");

  let allImages = [];
  let filteredImages = [];
  let selectedImages = new Set();
  let allSelected = false;
  let isDeepScanMode = false;

  // Load saved toggle state, then initialize
  chrome.storage.local.get(["deepScanEnabled"], (result) => {
    isDeepScanMode = result.deepScanEnabled || false;
    deepScanSwitch.checked = isDeepScanMode;
    deepScanConfig.style.display = isDeepScanMode ? "block" : "none";

    // Only auto-scan in normal mode
    if (!isDeepScanMode) {
      init();
    } else {
      // In deep scan mode, show a waiting state
      loadingState.style.display = "none";
      emptyState.style.display = "none";
      imageGrid.style.display = "none";
      showDeepScanReady();
    }
  });

  // Toggle Deep Scan mode
  deepScanSwitch.addEventListener("change", () => {
    isDeepScanMode = deepScanSwitch.checked;
    deepScanConfig.style.display = isDeepScanMode ? "block" : "none";

    // Persist toggle state
    chrome.storage.local.set({ deepScanEnabled: isDeepScanMode });

    if (!isDeepScanMode) {
      // Switched back to normal mode: do a quick extract
      loadingState.style.display = "flex";
      emptyState.style.display = "none";
      imageGrid.style.display = "none";
      init();
    } else {
      showDeepScanReady();
    }
  });

  function showDeepScanReady() {
    loadingState.style.display = "none";
    emptyState.style.display = "none";
    imageGrid.style.display = "none";

    // Show a hint if no images loaded yet
    if (allImages.length === 0) {
      emptyState.style.display = "flex";
      emptyState.querySelector("p").textContent = "Press \"Start Scan\" to begin deep extraction";
    }
  }

  // Listen for deep scan progress updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "deepScanProgress") {
      progressDetail.textContent = `Scroll ${message.current} / ${message.total}`;
      progressCount.textContent = `${message.imageCount} images found`;
    }
  });

  // Start Deep Scan
  startDeepScanBtn.addEventListener("click", async () => {
    const scrollCount = parseInt(scrollCountSelect.value);
    const scrollDelay = parseInt(scrollDelaySelect.value);

    // Show progress overlay
    deepScanProgress.style.display = "flex";
    progressDetail.textContent = `Scroll 0 / ${scrollCount}`;
    progressCount.textContent = "0 images found";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        deepScanProgress.style.display = "none";
        showToast("No active tab found");
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "deepScan",
          scrollCount: scrollCount,
          scrollDelay: scrollDelay,
        },
        (response) => {
          deepScanProgress.style.display = "none";

          if (chrome.runtime.lastError || !response || !response.images) {
            showToast("Deep scan failed");
            showEmpty();
            return;
          }

          allImages = response.images;
          showToast(`Scan complete! ${allImages.length} images found`);
          applyFilters();
        }
      );
    } catch (error) {
      deepScanProgress.style.display = "none";
      showToast("Deep scan error");
    }
  });

  // Stop Deep Scan
  stopDeepScanBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "stopDeepScan" });
    }
    showToast("Scan stopped");
  });

  // Normal mode init
  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showEmpty();
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "extractImages" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.images) {
          showEmpty();
          return;
        }

        allImages = response.images;
        applyFilters();
      });
    } catch (error) {
      console.error("Init error:", error);
      showEmpty();
    }
  }

  function applyFilters() {
    const minWidth = parseInt(minWidthSelect.value);
    const type = imageTypeSelect.value;

    filteredImages = allImages.filter((img) => {
      if (minWidth > 0 && img.width > 0 && img.width < minWidth) return false;
      if (type !== "all" && img.type !== type) return false;
      return true;
    });

    selectedImages.clear();
    allSelected = false;
    updateSelectAllButton();

    renderImages();
  }

  function renderImages() {
    if (filteredImages.length === 0) {
      showEmpty();
      return;
    }

    loadingState.style.display = "none";
    emptyState.style.display = "none";
    imageGrid.style.display = "grid";

    imageCount.textContent = filteredImages.length;
    totalInfo.textContent = `${filteredImages.length} images found`;

    imageGrid.innerHTML = "";

    filteredImages.forEach((img, index) => {
      const card = createImageCard(img, index);
      imageGrid.appendChild(card);
    });

    updateFooter();
  }

  function createImageCard(img, index) {
    const card = document.createElement("div");
    card.className = "image-card";
    card.dataset.index = index;

    // Checkbox
    const checkbox = document.createElement("div");
    checkbox.className = "checkbox";
    checkbox.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    // Image
    const imgEl = document.createElement("img");
    imgEl.loading = "lazy";
    imgEl.alt = img.alt || "Image";
    imgEl.src = img.src;
    imgEl.onerror = () => {
      imgEl.style.display = "none";
      const placeholder = document.createElement("div");
      placeholder.className = "error-placeholder";
      placeholder.textContent = "Load failed";
      card.appendChild(placeholder);
    };

    // Info overlay
    const info = document.createElement("div");
    info.className = "image-info";

    const typeBadge = document.createElement("span");
    typeBadge.className = "type-badge";
    typeBadge.textContent = img.type !== "unknown" ? img.type : "img";

    const sizeText = document.createElement("span");
    sizeText.className = "size-text";
    sizeText.textContent = img.width && img.height ? `${img.width}\u00D7${img.height}` : "";

    info.appendChild(typeBadge);
    info.appendChild(sizeText);

    // Copy button
    const cpBtn = document.createElement("button");
    cpBtn.className = "copy-btn";
    cpBtn.title = "Copy image to clipboard";
    cpBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M11 5V3C11 1.9 10.1 1 9 1H3C1.9 1 1 1.9 1 3V9C1 10.1 1.9 11 3 11H5" stroke="currentColor" stroke-width="1.5"/>
    </svg>`;

    cpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyImageToClipboard(img.src);
    });

    // Download button
    const dlBtn = document.createElement("button");
    dlBtn.className = "download-btn";
    dlBtn.title = "Download this image";
    dlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12V13C2 13.55 2.45 14 3 14H13C13.55 14 14 13.55 14 13V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    dlBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadSingleImage(img, index);
    });

    // Card click - toggle selection
    card.addEventListener("click", (e) => {
      if (e.target === dlBtn || dlBtn.contains(e.target)) return;
      if (e.target === cpBtn || cpBtn.contains(e.target)) return;
      toggleSelection(index, card);
    });

    card.appendChild(checkbox);
    card.appendChild(imgEl);
    card.appendChild(info);
    card.appendChild(cpBtn);
    card.appendChild(dlBtn);

    return card;
  }

  function toggleSelection(index, card) {
    if (selectedImages.has(index)) {
      selectedImages.delete(index);
      card.classList.remove("selected");
    } else {
      selectedImages.add(index);
      card.classList.add("selected");
    }

    allSelected = selectedImages.size === filteredImages.length;
    updateSelectAllButton();
    updateFooter();
  }

  function updateFooter() {
    selectedInfo.textContent = `${selectedImages.size} selected`;
    downloadBtn.disabled = selectedImages.size === 0;
    copyBtn.disabled = selectedImages.size === 0;
  }

  function updateSelectAllButton() {
    if (allSelected) {
      selectAllBtn.classList.add("active");
    } else {
      selectAllBtn.classList.remove("active");
    }
  }

  function showEmpty() {
    loadingState.style.display = "none";
    imageGrid.style.display = "none";
    emptyState.style.display = "flex";
    const emptyText = emptyState.querySelector("p");
    if (emptyText && !isDeepScanMode) {
      emptyText.textContent = "No images found on this page";
    }
    imageCount.textContent = "0";
    totalInfo.textContent = "0 images found";
  }

  function showToast(message) {
    const existingToast = document.querySelector(".toast");
    if (existingToast) existingToast.remove();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 350);
    }, 2000);
  }

  async function copyImageToClipboard(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      if (blob.type === "image/png") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        showToast("\u2713 Image copied to clipboard!");
        return;
      }

      const imgEl = new Image();
      imgEl.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(blob);

      imgEl.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0);
        URL.revokeObjectURL(objectUrl);

        canvas.toBlob(async (pngBlob) => {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": pngBlob }),
            ]);
            showToast("\u2713 Image copied to clipboard!");
          } catch (err) {
            await navigator.clipboard.writeText(imageUrl);
            showToast("\u2713 Image URL copied!");
          }
        }, "image/png");
      };

      imgEl.onerror = async () => {
        URL.revokeObjectURL(objectUrl);
        await navigator.clipboard.writeText(imageUrl);
        showToast("\u2713 Image URL copied!");
      };

      imgEl.src = objectUrl;
    } catch (error) {
      try {
        await navigator.clipboard.writeText(imageUrl);
        showToast("\u2713 Image URL copied!");
      } catch (e) {
        showToast("\u2717 Copy failed");
      }
    }
  }

  async function downloadSingleImage(img, index) {
    const ext = img.type && img.type !== "unknown" ? img.type : "jpg";
    const filename = `image_${String(index + 1).padStart(3, "0")}.${ext}`;

    chrome.runtime.sendMessage(
      {
        action: "downloadImage",
        url: img.src,
        filename: filename,
      },
      () => {
        showToast("\u2713 Download started!");
      }
    );
  }

  // Select All
  selectAllBtn.addEventListener("click", () => {
    allSelected = !allSelected;
    const cards = imageGrid.querySelectorAll(".image-card");

    if (allSelected) {
      filteredImages.forEach((_, index) => selectedImages.add(index));
      cards.forEach((card) => card.classList.add("selected"));
    } else {
      selectedImages.clear();
      cards.forEach((card) => card.classList.remove("selected"));
    }

    updateSelectAllButton();
    updateFooter();
  });

  // Download Selected
  downloadBtn.addEventListener("click", async () => {
    if (selectedImages.size === 0) return;

    const imagesToDownload = [];
    selectedImages.forEach((index) => {
      imagesToDownload.push(filteredImages[index]);
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const folderName = tab ? tab.title || "images" : "images";

    chrome.runtime.sendMessage(
      {
        action: "downloadAll",
        images: imagesToDownload,
        folderName: folderName,
      },
      () => {
        showToast(`\u2713 Downloading ${imagesToDownload.length} images!`);
      }
    );
  });

  // Copy Selected URLs
  copyBtn.addEventListener("click", async () => {
    if (selectedImages.size === 0) return;

    if (selectedImages.size === 1) {
      const index = [...selectedImages][0];
      await copyImageToClipboard(filteredImages[index].src);
    } else {
      const urls = [];
      selectedImages.forEach((index) => {
        urls.push(filteredImages[index].src);
      });
      try {
        await navigator.clipboard.writeText(urls.join("\n"));
        showToast(`\u2713 ${urls.length} URLs copied!`);
      } catch (e) {
        showToast("\u2717 Copy failed");
      }
    }
  });

  // Filters
  minWidthSelect.addEventListener("change", applyFilters);
  imageTypeSelect.addEventListener("change", applyFilters);
});

