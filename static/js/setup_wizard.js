/* Controls setup wizard steps and device-name conflict checks. */
document.addEventListener("DOMContentLoaded", () => {
  let step = 1;
  const totalSteps = 3;
  const steps = document.querySelectorAll(".wizard-step");
  const stepLabelWrappers = document.querySelectorAll(".setup-step-label-wrapper");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const finishBtn = document.getElementById("finishBtn");
  const progressAriaContainer = document.getElementById("progressAriaContainer");
  const wizardLive = document.getElementById("wizardLive");
  const form = document.getElementById("setupForm");

  const eventNameInput = document.getElementById("eventNameInput");

  const deviceInput = document.getElementById("deviceNameInput");
  const deviceConflict = document.getElementById("deviceConflict");
  const deviceSuggestions = document.getElementById("deviceSuggestions");
  const setupFileInput = document.getElementById("setupFileInput");
  const dataKeep = document.getElementById("dataKeep");
  const dataReset = document.getElementById("dataReset");

  const reviewEventName = document.getElementById("reviewEventName");
  const reviewSeason = document.getElementById("reviewSeason");
  const reviewSetupFile = document.getElementById("reviewSetupFile");
  const reviewDeviceName = document.getElementById("reviewDeviceName");
  const reviewDataAction = document.getElementById("reviewDataAction");

  let conflictRequestId = 0;
  let conflictDebounceTimer = null;

  function stepTitle(stepEl) {
    const heading = stepEl ? stepEl.querySelector(".setup-step-title") : null;
    return heading ? heading.textContent.trim() : `Step ${step}`;
  }

  function announceStep(stepEl) {
    if (!wizardLive) {
      return;
    }
    wizardLive.textContent = `${stepTitle(stepEl)}. Step ${step} of ${totalSteps}.`;
  }

  function focusStep(stepEl) {
    if (!stepEl) {
      return;
    }
    const focusTarget = stepEl.querySelector(
      "input:not([type='hidden']), button:not([disabled]), select, textarea"
    );
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  function updateReview() {
    if (!reviewEventName) {
      return;
    }
    const seasonInput = form ? form.querySelector("input[name='season']") : null;
    const checkedDataAction = form ? form.querySelector("input[name='data_action']:checked") : null;

    reviewEventName.textContent = eventNameInput && eventNameInput.value.trim() ? eventNameInput.value.trim() : "-";
    reviewSeason.textContent = seasonInput && seasonInput.value.trim() ? seasonInput.value.trim() : "-";
    reviewSetupFile.textContent =
      setupFileInput && setupFileInput.files && setupFileInput.files[0]
        ? setupFileInput.files[0].name
        : "None selected";
    reviewDeviceName.textContent = deviceInput && deviceInput.value.trim() ? deviceInput.value.trim() : "-";
    reviewDataAction.textContent = checkedDataAction && checkedDataAction.value === "reset"
      ? "Start fresh (clears all local data on this device)"
      : "Keep existing data";
  }

  function validateStep(currentStep) {
    if (currentStep === 1 && eventNameInput) {
      if (!eventNameInput.value.trim()) {
        eventNameInput.reportValidity();
        eventNameInput.focus();
        return false;
      }
    }

    if (currentStep === 2 && deviceInput) {
      if (!deviceInput.value.trim()) {
        deviceInput.reportValidity();
        deviceInput.focus();
        return false;
      }
    }

    return true;
  }

  function showStep(newStep) {
    if (newStep < 1 || newStep > totalSteps) {
      return;
    }
    step = newStep;
    let activeStepEl = null;

    steps.forEach((el) => {
      const isCurrent = el.getAttribute("data-step") === String(step);
      el.classList.toggle("d-none", !isCurrent);
      el.setAttribute("aria-hidden", String(!isCurrent));
      if (isCurrent) {
        activeStepEl = el;
      }
    });

    stepLabelWrappers.forEach((wrapper) => {
      const labelStep = Number(wrapper.getAttribute("data-step-label"));
      wrapper.classList.toggle("is-current", labelStep === step);
      wrapper.classList.toggle("is-complete", labelStep < step);
    });

    prevBtn.disabled = step === 1;
    nextBtn.classList.toggle("d-none", step === totalSteps);
    finishBtn.classList.toggle("d-none", step !== totalSteps);

    if (progressAriaContainer) {
      progressAriaContainer.setAttribute("aria-valuenow", String(step));
      progressAriaContainer.setAttribute("aria-valuetext", `Step ${step} of ${totalSteps}`);
    }

    if (step === 3) {
      updateReview();
    }

    announceStep(activeStepEl);
    focusStep(activeStepEl);
  }

  prevBtn.addEventListener("click", () => showStep(step - 1));
  nextBtn.addEventListener("click", () => {
    if (!validateStep(step)) {
      return;
    }
    showStep(step + 1);
  });

  document.querySelectorAll(".quick-name").forEach((btn) => {
    btn.addEventListener("click", () => {
      deviceInput.value = btn.getAttribute("data-name");
      scheduleDeviceCheck();
    });
  });

  async function checkDeviceName(requestId) {
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

      if (requestId !== conflictRequestId) {
        return;
      }

      deviceConflict.classList.toggle("d-none", !data.conflict);
      if (data.suggestions && data.suggestions.length) {
        deviceSuggestions.textContent = "Suggestions: " + data.suggestions.join(", ");
      } else {
        deviceSuggestions.textContent = "";
      }
    } catch (_err) {
      if (requestId !== conflictRequestId) {
        return;
      }
      deviceConflict.classList.add("d-none");
      deviceSuggestions.textContent = "";
    }
  }

  function scheduleDeviceCheck() {
    if (conflictDebounceTimer) {
      window.clearTimeout(conflictDebounceTimer);
    }
    conflictDebounceTimer = window.setTimeout(() => {
      conflictRequestId += 1;
      checkDeviceName(conflictRequestId);
    }, 250);
  }

  if (eventNameInput) {
    eventNameInput.addEventListener("input", updateReview);
  }
  if (deviceInput) {
    deviceInput.addEventListener("input", () => {
      updateReview();
      scheduleDeviceCheck();
    });
  }
  if (setupFileInput) {
    setupFileInput.addEventListener("change", () => {
      updateReview();
      updateFileDisplay();
    });
  }
  if (dataKeep) {
    dataKeep.addEventListener("change", () => {
      updateReview();
      scheduleDeviceCheck();
    });
  }
  if (dataReset) {
    dataReset.addEventListener("change", () => {
      updateReview();
      scheduleDeviceCheck();
    });
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      if (event.submitter && event.submitter.name === "skip_setup") {
        return;
      }
      if (!validateStep(1) || !validateStep(2)) {
        event.preventDefault();
        if (!validateStep(1)) {
          showStep(1);
        } else {
          showStep(2);
        }
      }
    });
  }

  function updateFileDisplay() {
    const placeholder = document.querySelector(".setup-file-placeholder");
    const selected = document.querySelector(".setup-file-selected");
    if (!setupFileInput || !placeholder || !selected) {
      return;
    }
    if (setupFileInput.files && setupFileInput.files[0]) {
      placeholder.classList.add("d-none");
      selected.classList.remove("d-none");
      selected.textContent = setupFileInput.files[0].name;
    } else {
      placeholder.classList.remove("d-none");
      selected.classList.add("d-none");
      selected.textContent = "";
    }
  }

  updateFileDisplay();
  updateReview();
  showStep(step);
});
