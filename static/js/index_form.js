/* Handles scouting form rendering, submit flow, and reset modal. */
document.addEventListener("DOMContentLoaded", () => {
  const fadeAndRemove = (el) => {
    if (!el) return;
    setTimeout(() => {
      el.style.transition = "opacity 0.3s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 2000);
  };

  fadeAndRemove(document.getElementById("save-success"));
  fadeAndRemove(document.getElementById("reset-message"));

  if (window.history && window.history.replaceState) {
    const url = new URL(window.location);
    url.searchParams.delete("success");
    url.searchParams.delete("reset");
    window.history.replaceState({}, document.title, url.toString());
  }

  const input = document.getElementById("reset-confirm-input");
  const confirmBtn = document.getElementById("reset-confirm-btn");
  const help = document.getElementById("reset-help");
  const REQUIRED_TEXT = "Delete my data";

  if (input && confirmBtn) {
    input.addEventListener("input", () => {
      const value = input.value.trim();
      const matches = value === REQUIRED_TEXT;
      confirmBtn.disabled = !matches;
      if (!matches && value.length > 0) {
        help.classList.remove("d-none");
      } else {
        help.classList.add("d-none");
      }
    });
  }

  try {
    const surveyJson = window.surveyJson;

    const collectElements = (node) => {
      const result = [];
      const walk = (value) => {
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (!value || typeof value !== "object") {
          return;
        }
        if (Array.isArray(value.elements)) {
          value.elements.forEach((element) => {
            if (element && typeof element === "object") {
              result.push(element);
            }
            walk(element);
          });
        }
        if (Array.isArray(value.pages)) {
          value.pages.forEach(walk);
        }
        if (Array.isArray(value.templateElements)) {
          value.templateElements.forEach(walk);
        }
      };
      walk(node);
      return result;
    };

    const elements = collectElements(surveyJson);
    if (!surveyJson || elements.length === 0) {
      document.getElementById("surveyContainer").innerHTML =
        '<div class="alert alert-warning">No survey configured. Please configure fields in Settings.</div>';
      return;
    }

    if (!surveyJson || typeof surveyJson !== "object") {
      document.getElementById("surveyContainer").innerHTML =
        '<div class="alert alert-warning">Invalid survey configuration. Please review Settings.</div>';
      return;
    }

    const survey = new Survey.Model(surveyJson);
    survey.lazyRenderEnabled = true;
    survey.clearInvisibleValues = "onComplete";
    if (window.AppSurveyTheme && typeof window.AppSurveyTheme.applyFormTheme === "function") {
      window.AppSurveyTheme.applyFormTheme(survey);
    } else if (window.SurveyTheme && window.SurveyTheme.LayeredDark) {
      survey.applyTheme(window.SurveyTheme.LayeredDark);
    }

    const serializeValue = (value) => {
      if (value === null || value === undefined) {
        return "";
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return "";
        }
        try {
          return JSON.stringify(value);
        } catch (error) {
          console.warn("Failed to serialize array value", error);
          return value.join(", ");
        }
      }
      if (typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch (error) {
          console.warn("Failed to serialize object value", error);
          return String(value);
        }
      }
      return String(value);
    };

    let isSubmitting = false;
    survey.onComplete.add((sender) => {
      if (isSubmitting) {
        return;
      }
      isSubmitting = true;
      const data = sender.data;
      const hiddenForm = document.getElementById("hiddenSubmitForm");
      const container = document.getElementById("hiddenFieldsContainer");

      container.innerHTML = "";

      for (const [key, value] of Object.entries(data)) {
        const hiddenInput = document.createElement("input");
        hiddenInput.type = "hidden";
        hiddenInput.name = key;
        hiddenInput.value = serializeValue(value);
        container.appendChild(hiddenInput);
      }

      hiddenForm.submit();
    });

    survey.render(document.getElementById("surveyContainer"));
  } catch (error) {
    console.error("SurveyJS initialization error:", error);
    document.getElementById("surveyContainer").innerHTML =
      '<div class="alert alert-danger">Error loading survey form. Please check configuration.</div>';
  }
});
