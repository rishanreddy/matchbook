/* Handles update checks, download/apply actions, and banner state. */
document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("update-banner");
  const dismissBtn = document.getElementById("update-dismiss");
  const messageEl = document.getElementById("update-message");
  const detailEl = document.getElementById("update-detail");
  const linkEl = document.getElementById("update-link");
  const actionEl = document.getElementById("update-action");
  const progressWrapEl = document.getElementById("update-progress-wrap");
  const progressBarEl = document.getElementById("update-progress-bar");

  let statusPollTimer = null;

  const showBanner = () => banner?.classList.remove("d-none");
  const hideBanner = () => banner?.classList.add("d-none");

  const setDetail = (text) => {
    if (!detailEl) {
      return;
    }
    if (text) {
      detailEl.classList.remove("d-none");
      detailEl.textContent = text;
      return;
    }
    detailEl.classList.add("d-none");
    detailEl.textContent = "";
  };

  const setProgress = (percent) => {
    if (!progressWrapEl || !progressBarEl) {
      return;
    }

    if (typeof percent !== "number" || Number.isNaN(percent)) {
      progressWrapEl.classList.add("d-none");
      progressBarEl.style.width = "0%";
      progressBarEl.setAttribute("aria-valuenow", "0");
      return;
    }

    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressWrapEl.classList.remove("d-none");
    progressBarEl.style.width = `${clamped}%`;
    progressBarEl.setAttribute("aria-valuenow", String(clamped));
  };

  const fetchJson = async (url, options) => {
    const response = await fetch(url, options);
    const payload = await response.json();
    return { ok: response.ok, payload };
  };

  const stopStatusPolling = () => {
    if (statusPollTimer) {
      window.clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  };

  const startStatusPolling = () => {
    if (statusPollTimer) {
      return;
    }

    statusPollTimer = window.setInterval(async () => {
      try {
        const { payload } = await fetchJson("/api/version");
        const state = payload.state || {};
        const stateStatus = String(state.status || "").toLowerCase();
        const progressPercent = Number(state.progress_percent);

        if (stateStatus === "downloading") {
          setProgress(Number.isFinite(progressPercent) ? progressPercent : null);
          setDetail(
            Number.isFinite(progressPercent)
              ? `Downloading update... ${Math.round(progressPercent)}%`
              : "Downloading update..."
          );
          return;
        }

        if (stateStatus === "downloaded") {
          setProgress(100);
          setDetail("Download complete. Ready to apply.");
          stopStatusPolling();
          return;
        }

        if (stateStatus === "error") {
          setProgress(null);
          setDetail(state.error || "Update failed. Please retry.");
          stopStatusPolling();
          return;
        }
      } catch (error) {
        console.debug("[UpdateBanner] Status poll failed", error);
      }
    }, 900);
  };

  const setActionButton = ({ visible, text, disabled, onClick }) => {
    if (!actionEl) {
      return;
    }

    if (!visible) {
      actionEl.classList.add("d-none");
      actionEl.onclick = null;
      return;
    }

    actionEl.classList.remove("d-none");
    actionEl.textContent = text;
    actionEl.disabled = Boolean(disabled);
    actionEl.onclick = onClick || null;
  };

  const applyUpdate = async () => {
    setActionButton({ visible: true, text: "Applying...", disabled: true });
    setDetail("Applying update. The app will restart automatically if successful.");

    try {
      const { ok, payload } = await fetchJson("/api/update/apply", { method: "POST" });
      if (ok && payload.success) {
        messageEl.textContent = payload.message || "Update is being applied.";
        setActionButton({ visible: true, text: "Restarting...", disabled: true });
        return;
      }

      setActionButton({ visible: true, text: "Apply Update", disabled: false, onClick: applyUpdate });
      setDetail(payload.error || "Update apply failed.");
    } catch (error) {
      setActionButton({ visible: true, text: "Apply Update", disabled: false, onClick: applyUpdate });
      setDetail("Could not apply update right now. Please retry.");
      console.warn("[UpdateBanner] Update apply failed", error);
    }
  };

  const downloadUpdate = async () => {
    setActionButton({ visible: true, text: "Downloading...", disabled: true });
    setDetail("Preparing download...");
    setProgress(0);
    startStatusPolling();

    try {
      const { ok, payload } = await fetchJson("/api/update/download", { method: "POST" });
      stopStatusPolling();

      if (ok && payload.success) {
        setProgress(100);
        setDetail("Download complete. Click Apply Update.");
        setActionButton({ visible: true, text: "Apply Update", disabled: false, onClick: applyUpdate });
        return;
      }

      setProgress(null);
      setDetail(payload.error || "Download failed.");
      setActionButton({ visible: true, text: "Retry Download", disabled: false, onClick: downloadUpdate });
    } catch (error) {
      stopStatusPolling();
      setProgress(null);
      setDetail("Could not download update right now. Please retry.");
      setActionButton({ visible: true, text: "Retry Download", disabled: false, onClick: downloadUpdate });
      console.warn("[UpdateBanner] Update download failed", error);
    }
  };

  const applyStateToBanner = (data) => {
    const state = data.state || {};
    const mode = String(data.mode || "source");
    const stateStatus = String(state.status || "idle").toLowerCase();

    if (!data.update_available || mode !== "packaged") {
      hideBanner();
      stopStatusPolling();
      return;
    }

    showBanner();
    messageEl.textContent = `Update available: v${data.current_version} -> v${data.latest_version}`;
    linkEl.href = data.download_url || "#";

    if (stateStatus === "downloading") {
      const progressPercent = Number(state.progress_percent);
      setProgress(Number.isFinite(progressPercent) ? progressPercent : 0);
      setDetail(
        Number.isFinite(progressPercent)
          ? `Downloading update... ${Math.round(progressPercent)}%`
          : "Downloading update..."
      );
      setActionButton({ visible: true, text: "Downloading...", disabled: true });
      startStatusPolling();
      return;
    }

    if (stateStatus === "downloaded") {
      setProgress(100);
      setDetail("Download complete. Ready to apply.");
      setActionButton({ visible: true, text: "Apply Update", disabled: false, onClick: applyUpdate });
      return;
    }

    if (stateStatus === "applying") {
      setProgress(null);
      setDetail("Applying update. App restart is expected.");
      setActionButton({ visible: true, text: "Applying...", disabled: true });
      return;
    }

    if (stateStatus === "error") {
      setProgress(null);
      setDetail(state.error || "Update failed. Retry download.");
      setActionButton({ visible: true, text: "Retry Download", disabled: false, onClick: downloadUpdate });
      return;
    }

    setProgress(null);
    setDetail("Download the update, then apply it from this banner.");
    setActionButton({ visible: true, text: "Download Update", disabled: false, onClick: downloadUpdate });
  };

  dismissBtn?.addEventListener("click", () => {
    hideBanner();
    stopStatusPolling();
  });

  fetchJson("/api/version")
    .then(({ payload }) => {
      applyStateToBanner(payload || {});
    })
    .catch((error) => {
      console.debug("[UpdateBanner] Could not check update state", error);
      hideBanner();
    });
});
