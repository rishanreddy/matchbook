/* Controls setup wizard steps and review state. */
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
  const setupFileInput = document.getElementById("setupFileInput");
  const dataKeep = document.getElementById("dataKeep");
  const dataReset = document.getElementById("dataReset");
  const deviceIdPreview = document.getElementById("deviceIdPreview");

  const reviewEventName = document.getElementById("reviewEventName");
  const reviewSeason = document.getElementById("reviewSeason");
  const reviewSetupFile = document.getElementById("reviewSetupFile");
  const reviewDeviceId = document.getElementById("reviewDeviceId");
  const reviewDataAction = document.getElementById("reviewDataAction");

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
      "input:not([type='hidden']):not([disabled]), button:not([disabled]), select, textarea"
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
    const checkedDataAction = form
      ? form.querySelector("input[name='data_action']:checked")
      : null;

    reviewEventName.textContent =
      eventNameInput && eventNameInput.value.trim() ? eventNameInput.value.trim() : "-";
    reviewSeason.textContent =
      seasonInput && seasonInput.value.trim() ? seasonInput.value.trim() : "-";
    reviewSetupFile.textContent =
      setupFileInput && setupFileInput.files && setupFileInput.files[0]
        ? setupFileInput.files[0].name
        : "None selected";
    reviewDeviceId.textContent =
      deviceIdPreview && deviceIdPreview.textContent.trim()
        ? deviceIdPreview.textContent.trim()
        : "-";
    reviewDataAction.textContent =
      checkedDataAction && checkedDataAction.value === "reset"
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
    console.debug("[SetupWizard] Showing step", step);
  }

  prevBtn.addEventListener("click", () => showStep(step - 1));
  nextBtn.addEventListener("click", () => {
    if (!validateStep(step)) {
      return;
    }
    showStep(step + 1);
  });

  if (eventNameInput) {
    eventNameInput.addEventListener("input", updateReview);
  }

  if (setupFileInput) {
    setupFileInput.addEventListener("change", () => {
      updateReview();
      updateFileDisplay();
      if (setupFileInput.files && setupFileInput.files[0]) {
        console.debug("[SetupWizard] Setup file selected", setupFileInput.files[0].name);
      }
    });
  }

  if (dataKeep) {
    dataKeep.addEventListener("change", updateReview);
  }

  if (dataReset) {
    dataReset.addEventListener("change", updateReview);
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      if (event.submitter && event.submitter.name === "skip_setup") {
        console.debug("[SetupWizard] Skip setup submitted");
        return;
      }

      if (!validateStep(1)) {
        event.preventDefault();
        showStep(1);
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
  
  // Device ID copy functionality
  const copyBtnWizard = document.querySelector(".device-id-copy-btn-wizard");
  if (copyBtnWizard) {
    copyBtnWizard.addEventListener("click", async () => {
      const idToCopy = copyBtnWizard.getAttribute("data-device-id") || "";
      if (!idToCopy || idToCopy === "Generating...") {
        return;
      }
      
      try {
        await navigator.clipboard.writeText(idToCopy);
        copyBtnWizard.classList.add("copied");
        copyBtnWizard.setAttribute("title", "Copied!");
        setTimeout(() => {
          copyBtnWizard.classList.remove("copied");
          copyBtnWizard.setAttribute("title", "Copy full device ID");
        }, 2000);
      } catch (error) {
        console.error("[SetupWizard] Failed to copy device ID:", error);
      }
    });
  }
  
  const deviceIdPreviewEl = document.getElementById("deviceIdPreview");
  if (deviceIdPreviewEl) {
    const fullId = deviceIdPreviewEl.getAttribute("data-full-id") || "";
    if (fullId && fullId !== "Generating...") {
      deviceIdPreviewEl.setAttribute("title", fullId);
    }
  }
});
