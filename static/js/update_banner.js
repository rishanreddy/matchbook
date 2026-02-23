document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("update-banner");
  const alertBox = document.getElementById("update-banner-alert");
  const messageEl = document.getElementById("update-banner-message");
  const detailEl = document.getElementById("update-banner-detail");
  const actionBtn = document.getElementById("update-banner-action");
  const dismissBtn = document.getElementById("update-banner-dismiss");
  const releaseLink = document.getElementById("update-banner-release-link");
  const progressWrap = banner ? banner.querySelector(".progress") : null;
  const progressBar = document.getElementById("update-banner-progress-bar");

  if (!banner || !alertBox || !messageEl || !detailEl || !dismissBtn) {
    return;
  }

  const state = {
    pollTimer: null,
    mode: null,
    releaseUrl: null,
    latestVersion: null,
    currentVersion: null,
  };

  const clearPolling = () => {
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  };

  const hide = () => {
    clearPolling();
    banner.classList.add("d-none");
  };

  const show = () => {
    banner.classList.remove("d-none");
  };

  const setAlertTone = (tone) => {
    alertBox.classList.remove("alert-warning", "alert-info", "alert-danger", "alert-success");
    alertBox.classList.add(`alert-${tone}`);
  };

  const setMessage = (message, detail) => {
    messageEl.textContent = message || "";
    detailEl.textContent = detail || "";
  };

  const setReleaseLink = (url) => {
    if (!releaseLink) return;
    if (url) {
      releaseLink.href = url;
      releaseLink.classList.remove("d-none");
    } else {
      releaseLink.href = "#";
      releaseLink.classList.add("d-none");
    }
  };

  const setAction = (label, handler, style = "primary") => {
    if (!actionBtn) return;
    actionBtn.className = `btn btn-sm btn-${style}`;
    actionBtn.textContent = label || "";
    if (label && typeof handler === "function") {
      actionBtn.classList.remove("d-none");
      actionBtn.disabled = false;
      actionBtn.onclick = handler;
    } else {
      actionBtn.classList.add("d-none");
      actionBtn.onclick = null;
    }
  };

  const setProgress = (percent, showProgress) => {
    if (!progressWrap || !progressBar) return;
    if (showProgress) {
      progressWrap.classList.remove("d-none");
    } else {
      progressWrap.classList.add("d-none");
    }

    const safeValue = Number.isFinite(percent)
      ? Math.max(0, Math.min(100, Math.round(percent)))
      : 0;
    progressBar.style.width = `${safeValue}%`;
    progressBar.textContent = `${safeValue}%`;
    progressBar.setAttribute("aria-valuenow", String(safeValue));
    progressBar.setAttribute("aria-valuemin", "0");
    progressBar.setAttribute("aria-valuemax", "100");
  };

  const parseProgress = (payload) => {
    const candidates = [
      payload?.progress,
      payload?.download_progress,
      payload?.percent,
      payload?.state?.progress,
    ];
    for (const value of candidates) {
      if (Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const num = Number.parseFloat(value);
        if (Number.isFinite(num)) return num;
      }
    }
    return 0;
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || data?.message || "Request failed";
      throw new Error(message);
    }
    return data;
  };

  const showDownloadError = (errorText) => {
    show();
    setAlertTone("danger");
    setProgress(0, false);
    setReleaseLink(state.releaseUrl);
    setMessage("Update failed", errorText || "Unable to download update.");
    setAction("Retry update", startDownload, "outline-light");
  };

  const pollUpdateState = async () => {
    clearPolling();
    try {
      const data = await fetchJson("/api/update/state");
      const status = String(data?.state?.status || data?.status || "").toLowerCase();
      const progress = parseProgress(data);

      if (status === "error" || data?.error) {
        showDownloadError(data?.error || data?.message || "Update process reported an error.");
        return;
      }

      if (status === "downloaded" || status === "ready") {
        show();
        setAlertTone("success");
        setProgress(100, true);
        setReleaseLink(state.releaseUrl);
        setMessage(
          `Update ready ${state.currentVersion ? `v${state.currentVersion} -> ` : ""}v${state.latestVersion || "new version"}`,
          "The update has finished downloading. Restart to apply it."
        );
        setAction("Restart to update", applyUpdate, "success");
        return;
      }

      if (status === "downloading" || status === "in_progress") {
        show();
        setAlertTone("warning");
        setProgress(progress, true);
        setReleaseLink(state.releaseUrl);
        setMessage("Downloading update", data?.message || "Please keep the app open until download completes.");
        setAction("Downloading...", null);
        if (actionBtn) actionBtn.disabled = true;
        state.pollTimer = window.setTimeout(pollUpdateState, 1500);
        return;
      }

      if (status === "applying") {
        show();
        setAlertTone("info");
        setProgress(100, true);
        setMessage("Applying update", data?.message || "Restarting app with update.");
        setAction(null, null);
        return;
      }

      state.pollTimer = window.setTimeout(pollUpdateState, 2000);
    } catch (error) {
      showDownloadError(error.message);
    }
  };

  async function startDownload() {
    try {
      show();
      setAlertTone("warning");
      setReleaseLink(state.releaseUrl);
      setProgress(0, true);
      setMessage("Starting update download", "Preparing update package...");
      setAction("Downloading...", null);
      if (actionBtn) actionBtn.disabled = true;
      await fetchJson("/api/update/download", { method: "POST" });
      pollUpdateState();
    } catch (error) {
      showDownloadError(error.message);
    }
  }

  async function applyUpdate() {
    try {
      show();
      setAlertTone("info");
      setProgress(100, true);
      setMessage("Applying update", "Restarting to apply update...");
      setAction(null, null);
      await fetchJson("/api/update/apply", { method: "POST" });
    } catch (error) {
      showDownloadError(error.message || "Could not apply update.");
    }
  }

  dismissBtn.addEventListener("click", hide);

  const init = async () => {
    try {
      const data = await fetchJson("/api/version");
      const updateAvailable = Boolean(data?.update_available);
      if (!updateAvailable) {
        hide();
        return;
      }

      state.mode = data?.mode || "";
      state.releaseUrl = data?.download_url || data?.release_url || data?.url || null;
      state.latestVersion = data?.latest_version || data?.latest || data?.version || null;
      state.currentVersion = data?.current_version || data?.current || null;

      if (state.mode === "source") {
        show();
        setAlertTone("info");
        setProgress(0, false);
        setReleaseLink(state.releaseUrl);
        setMessage(
          `Update available ${state.latestVersion ? `v${state.latestVersion}` : ""}`.trim(),
          "Source mode detected. Download and install the latest release manually."
        );
        setAction(null, null);
        return;
      }

      if (state.mode === "packaged") {
        show();
        setAlertTone("warning");
        setProgress(0, false);
        setReleaseLink(state.releaseUrl);
        const from = state.currentVersion ? `v${state.currentVersion}` : "current";
        const to = state.latestVersion ? `v${state.latestVersion}` : "new";
        setMessage(`Update available ${from} -> ${to}`, "A newer app version is ready to download.");
        setAction("Update now", startDownload, "primary");
        return;
      }

      hide();
    } catch (_error) {
      hide();
    }
  };

  init();
});
