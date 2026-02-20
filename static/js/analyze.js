/* Manages analysis upload interactions and table stats. */
document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const fileListContainer = document.getElementById("fileListContainer");
  const submitBtn = document.getElementById("submitBtn");
  const clearBtn = document.getElementById("clearBtn");

  if (dropZone) {
    dropZone.addEventListener("click", () => fileInput.click());

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Add visual feedback for drag over
    dropZone.addEventListener("dragenter", () => {
      dropZone.classList.add("drag-over");
    });
    
    dropZone.addEventListener("dragleave", (e) => {
      // Only remove if leaving the dropZone itself, not children
      if (e.target === dropZone) {
        dropZone.classList.remove("drag-over");
      }
    });

    dropZone.addEventListener("drop", (e) => {
      dropZone.classList.remove("drag-over");
      const dt = e.dataTransfer;
      fileInput.files = dt.files;
      handleFiles(dt.files);
    });

    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    function handleFiles(files) {
      if (files.length === 0) {
        fileListContainer.classList.add("d-none");
        submitBtn.disabled = true;
        clearBtn.classList.add("d-none");
        return;
      }

      fileList.innerHTML = "";
      Array.from(files).forEach((file) => {
        const item = document.createElement("div");
        item.className = "small";
        item.textContent = `${file.name} (${formatFileSize(file.size)})`;
        fileList.appendChild(item);
      });

      fileListContainer.classList.remove("d-none");
      submitBtn.disabled = false;
      clearBtn.classList.remove("d-none");
    }

    function formatFileSize(bytes) {
      if (bytes === 0) return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
    }

    clearBtn.addEventListener("click", () => {
      fileInput.value = "";
      fileList.innerHTML = "";
      fileListContainer.classList.add("d-none");
      submitBtn.disabled = true;
      clearBtn.classList.add("d-none");
    });
  }

  const tableEl = document.getElementById("combinedTable");
  if (tableEl) {
    const headers = Array.from(tableEl.querySelectorAll("thead th")).map((th) => th.textContent.trim().toLowerCase());
    const matchIndex = headers.findIndex((h) => h.includes("match"));
    if (matchIndex >= 0) {
      const unique = new Set();
      Array.from(tableEl.querySelectorAll("tbody tr")).forEach((row) => {
        const cell = row.children[matchIndex];
        if (cell && cell.textContent.trim()) {
          unique.add(cell.textContent.trim());
        }
      });
      const uniqueMatchesEl = document.getElementById("uniqueMatches");
      if (uniqueMatchesEl) uniqueMatchesEl.textContent = unique.size;
    }
  }
});
