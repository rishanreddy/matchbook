/* Handles app update banner version check and actions. */
document.addEventListener("DOMContentLoaded", () => {
  const dismissBtn = document.getElementById("update-dismiss");
  const banner = document.getElementById("update-banner");
  dismissBtn?.addEventListener("click", () => {
    banner?.classList.add("d-none");
  });

  fetch("/api/version")
    .then((response) => response.json())
    .then((data) => {
      // Only show update banner and actions in packaged mode (EXE)
      if (data.update_available && data.mode === "packaged") {
        const banner = document.getElementById("update-banner");
        const message = document.getElementById("update-message");
        const link = document.getElementById("update-link");
        const action = document.getElementById("update-action");

        message.textContent = `Update available! v${data.current_version} → v${data.latest_version}`;
        link.href = data.download_url;

        action.classList.remove("d-none");
        action.textContent = "Update now";
        action.onclick = async () => {
          action.disabled = true;
          action.textContent = "Applying...";
          try {
            const res = await fetch("/api/update/apply", { method: "POST" });
            const payload = await res.json();
            if (payload.success) {
              message.textContent = payload.message || "Update started. App will restart.";
              action.textContent = "Restarting...";
            } else {
              action.disabled = false;
              action.textContent = "Update now";
              message.textContent = payload.error || "Update failed";
            }
          } catch (_err) {
            action.disabled = false;
            action.textContent = "Update now";
            message.textContent = "Update failed";
          }
        };

        banner.classList.remove("d-none");
      }
    })
    .catch((error) => {
      console.debug("Could not check for updates:", error);
    });
});
