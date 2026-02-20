/* Controls setup wizard steps and device-name conflict checks. */
document.addEventListener("DOMContentLoaded", () => {
  let step = 1;
  const steps = document.querySelectorAll(".wizard-step");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const finishBtn = document.getElementById("finishBtn");
  const progress = document.getElementById("wizardProgress");

  const deviceInput = document.getElementById("deviceNameInput");
  const deviceConflict = document.getElementById("deviceConflict");
  const deviceSuggestions = document.getElementById("deviceSuggestions");
  const dataKeep = document.getElementById("dataKeep");
  const dataReset = document.getElementById("dataReset");

  function showStep(newStep) {
    step = newStep;
    steps.forEach((el) => {
      el.classList.toggle("d-none", el.getAttribute("data-step") !== String(step));
    });
    prevBtn.disabled = step === 1;
    nextBtn.classList.toggle("d-none", step === 2);
    finishBtn.classList.toggle("d-none", step !== 2);
    progress.style.width = `${(step / 2) * 100}%`;
  }

  prevBtn.addEventListener("click", () => showStep(step - 1));
  nextBtn.addEventListener("click", () => showStep(step + 1));

  document.querySelectorAll(".quick-name").forEach((btn) => {
    btn.addEventListener("click", () => {
      deviceInput.value = btn.getAttribute("data-name");
      checkDeviceName();
    });
  });

  async function checkDeviceName() {
    if (dataReset && dataReset.checked) {
      deviceConflict.classList.add("d-none");
      deviceSuggestions.textContent = "";
      return;
    }
    const name = deviceInput.value.trim();
    if (!name) {
      deviceConflict.classList.add("d-none");
      return;
    }
    try {
      const response = await fetch("/api/check-device-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      deviceConflict.classList.toggle("d-none", !data.conflict);
      if (data.suggestions && data.suggestions.length) {
        deviceSuggestions.textContent = "Suggestions: " + data.suggestions.join(", ");
      } else {
        deviceSuggestions.textContent = "";
      }
    } catch (_err) {
      deviceConflict.classList.add("d-none");
      deviceSuggestions.textContent = "";
    }
  }

  deviceInput.addEventListener("input", checkDeviceName);
  if (dataKeep) dataKeep.addEventListener("change", checkDeviceName);
  if (dataReset) dataReset.addEventListener("change", checkDeviceName);

  showStep(step);
});
