document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("update-banner");
  const messageEl = document.getElementById("update-banner-message");
  const releaseLink = document.getElementById("update-banner-release-link");
  const dismissBtn = document.getElementById("update-banner-dismiss");

  if (!banner || !messageEl || !releaseLink || !dismissBtn) {
    return;
  }

  const hideBanner = () => {
    banner.classList.add("d-none");
  };

  const showBanner = () => {
    banner.classList.remove("d-none");
  };

  const setReleaseLink = (url) => {
    if (url) {
      releaseLink.href = url;
      releaseLink.classList.remove("d-none");
      return;
    }
    releaseLink.href = "#";
    releaseLink.classList.add("d-none");
  };

  dismissBtn.addEventListener("click", hideBanner);

  const initBanner = async () => {
    try {
      const response = await fetch("/api/version");
      if (!response.ok) {
        hideBanner();
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!data?.update_available) {
        hideBanner();
        return;
      }

      const currentVersion = data?.current_version || data?.current || "current";
      const latestVersion = data?.latest_version || data?.latest || "latest";
      const downloadUrl = data?.download_url || "";

      messageEl.textContent = `Update available: v${currentVersion} -> v${latestVersion}`;
      setReleaseLink(downloadUrl);
      showBanner();
    } catch (_error) {
      hideBanner();
    }
  };

  hideBanner();
  initBanner();
});
