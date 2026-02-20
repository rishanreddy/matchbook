/* Auto-dismiss alerts with fade animation and progress bar */
document.addEventListener("DOMContentLoaded", () => {
  const fadeAndRemove = (el, duration = 4000) => {
    if (!el) return;
    
    // Add fading class after duration
    setTimeout(() => {
      el.classList.add("fading");
      
      // Remove element after fade animation completes
      setTimeout(() => {
        el.remove();
      }, 250); // Match CSS transition duration
    }, duration);
  };

  // Auto-dismiss all alerts with IDs
  const alertIds = ["save-success", "reset-message", "import-success", "error-message"];
  alertIds.forEach(id => {
    const alert = document.getElementById(id);
    if (alert) {
      fadeAndRemove(alert);
    }
  });

  // Clean up URL parameters
  if (window.history && window.history.replaceState) {
    const url = new URL(window.location);
    const paramsToRemove = ["success", "reset", "saved", "error"];
    paramsToRemove.forEach(param => url.searchParams.delete(param));
    window.history.replaceState({}, document.title, url.toString());
  }
});
