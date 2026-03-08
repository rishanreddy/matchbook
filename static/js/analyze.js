/* Manages analysis upload interactions and table stats. */
document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("uploadForm");
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const fileListContainer = document.getElementById("fileListContainer");
  const submitBtn = document.getElementById("submitBtn");
  const clearBtn = document.getElementById("clearBtn");

  if (dropZone) {
    dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

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
        console.debug("[Analyze] Cleared file selection");
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
      console.debug("[Analyze] Selected files", files.length);
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
      console.debug("[Analyze] File selection reset by user");
    });
  }

  if (uploadForm && submitBtn) {
    uploadForm.addEventListener("submit", () => {
      submitBtn.disabled = true;
      submitBtn.classList.add("loading");
      submitBtn.textContent = "Loading data...";

      if (clearBtn) {
        clearBtn.disabled = true;
      }

      submitBtn.setAttribute("aria-busy", "true");
      submitBtn.setAttribute("aria-label", "Loading data");
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

  const teamsGrid = document.getElementById("teamsGrid");
  const teamSearch = document.getElementById("teamSearch");
  const teamSort = document.getElementById("teamSort");
  const teamSortDir = document.getElementById("teamSortDir");
  const teamsResultCount = document.getElementById("teamsResultCount");
  const teamsEmptyState = document.getElementById("teamsEmptyState");

  if (teamsGrid && teamSearch && teamSort && teamSortDir) {
    const teamCards = Array.from(teamsGrid.querySelectorAll(".team-card-col"));

    const parseNumber = (rawValue, fallback = 0) => {
      const parsed = Number.parseFloat(rawValue);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const getSortValue = (card, sortKey) => {
      if (sortKey === "team_number") {
        return parseNumber(card.dataset.teamNumber, 0);
      }
      if (sortKey === "total_matches") {
        return parseNumber(card.dataset.totalMatches, 0);
      }
      if (sortKey.startsWith("stat:")) {
        const statKey = sortKey.slice(5);
        return parseNumber(card.getAttribute(`data-stat-${statKey}`), 0);
      }
      return 0;
    };

    const updateTeamsView = () => {
      const query = teamSearch.value.trim().toLowerCase();
      const sortKey = teamSort.value;
      const direction = teamSortDir.value;

      const visibleCards = teamCards.filter((card) => {
        const teamNumber = (card.dataset.teamNumber || "").toLowerCase();
        const matchesSearch = !query || teamNumber.includes(query);
        card.classList.toggle("d-none", !matchesSearch);
        return matchesSearch;
      });

      visibleCards.sort((a, b) => {
        const aValue = getSortValue(a, sortKey);
        const bValue = getSortValue(b, sortKey);
        if (aValue === bValue) {
          const aTeam = parseNumber(a.dataset.teamNumber, 0);
          const bTeam = parseNumber(b.dataset.teamNumber, 0);
          return aTeam - bTeam;
        }
        if (direction === "desc") {
          return bValue - aValue;
        }
        return aValue - bValue;
      });

      visibleCards.forEach((card) => {
        teamsGrid.appendChild(card);
      });

      if (teamsResultCount) {
        const total = teamCards.length;
        const shown = visibleCards.length;
        teamsResultCount.textContent = `${shown} of ${total} teams shown`;
      }

      if (teamsEmptyState) {
        teamsEmptyState.classList.toggle("d-none", visibleCards.length > 0);
      }
    };

    teamSearch.addEventListener("input", updateTeamsView);
    teamSort.addEventListener("change", () => {
      const sortKey = teamSort.value;
      if (sortKey.startsWith("stat:")) {
        teamSortDir.value = "desc";
      } else if (sortKey === "team_number") {
        teamSortDir.value = "asc";
      }
      updateTeamsView();
    });
    teamSortDir.addEventListener("change", updateTeamsView);
    updateTeamsView();
  }
});
