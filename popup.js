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

  let allImages = [];
  let filteredImages = [];
  let selectedImages = new Set();
  let allSelected = false;

  // Initialize - extract images from the active tab
  init();

  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showEmpty();
        return;
      }

      // Send message to content script
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
      // Filter by minimum width
      if (minWidth > 0 && img.width > 0 && img.width < minWidth) return false;

      // Filter by type
      if (type !== "all" && img.type !== type) return false;

      return true;
    });

    // Reset selection
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
      placeholder.textContent = "⚠ Load failed";
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
    sizeText.textContent = img.width && img.height ? `${img.width}×${img.height}` : "";

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

    // Update allSelected state
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
    imageCount.textContent = "0";
    totalInfo.textContent = "0 images found";
  }

  function showToast(message) {
    // Remove existing toast
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
      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // If it's already a PNG, write directly
      if (blob.type === "image/png") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        showToast("✓ Image copied to clipboard!");
        return;
      }

      // Otherwise, convert to PNG via canvas
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
            showToast("✓ Image copied to clipboard!");
          } catch (err) {
            // Fallback: copy the URL instead
            await navigator.clipboard.writeText(imageUrl);
            showToast("✓ Image URL copied!");
          }
        }, "image/png");
      };

      imgEl.onerror = async () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback: copy URL
        await navigator.clipboard.writeText(imageUrl);
        showToast("✓ Image URL copied!");
      };

      imgEl.src = objectUrl;
    } catch (error) {
      // Final fallback: copy URL as text
      try {
        await navigator.clipboard.writeText(imageUrl);
        showToast("✓ Image URL copied!");
      } catch (e) {
        showToast("✗ Copy failed");
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
        showToast("✓ Download started!");
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

    // Get page title for folder name
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const folderName = tab ? tab.title || "images" : "images";

    chrome.runtime.sendMessage(
      {
        action: "downloadAll",
        images: imagesToDownload,
        folderName: folderName,
      },
      () => {
        showToast(`✓ Downloading ${imagesToDownload.length} images!`);
      }
    );
  });

  // Copy Selected URLs
  copyBtn.addEventListener("click", async () => {
    if (selectedImages.size === 0) return;

    if (selectedImages.size === 1) {
      // Single image: copy the actual image to clipboard
      const index = [...selectedImages][0];
      await copyImageToClipboard(filteredImages[index].src);
    } else {
      // Multiple images: copy all URLs as text
      const urls = [];
      selectedImages.forEach((index) => {
        urls.push(filteredImages[index].src);
      });
      try {
        await navigator.clipboard.writeText(urls.join("\n"));
        showToast(`✓ ${urls.length} URLs copied!`);
      } catch (e) {
        showToast("✗ Copy failed");
      }
    }
  });

  // Filters
  minWidthSelect.addEventListener("change", applyFilters);
  imageTypeSelect.addEventListener("change", applyFilters);
});
