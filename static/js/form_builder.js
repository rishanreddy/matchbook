/* Initializes SurveyJS form builder. */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formBuilderForm");
  const saveBtn = document.getElementById("saveFormBtn");
  const hiddenJsonInput = document.getElementById("surveyJsonInput");
  const propertyPanelToggleBtn = document.getElementById("propertyPanelToggleBtn");
  const saveStatus = document.getElementById("saveStatus");
  const jsonEditor = document.getElementById("surveyJsonEditor");
  const fallbackPanel = document.getElementById("jsonFallbackPanel");
  const jsonError = document.getElementById("jsonValidationError");
  const creatorHost = document.getElementById("surveyCreatorHost");
  const requiredFieldGroupsData = document.getElementById("requiredFieldGroupsData");
  const strictRequiredFieldsData = document.getElementById("strictRequiredFieldsData");

  const parseJsonScript = (el, fallback) => {
    if (!el || !el.textContent) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(el.textContent);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  };

  const requiredGroupsFromConfig = parseJsonScript(requiredFieldGroupsData, []);
  const strictRequiredFromConfig = parseJsonScript(strictRequiredFieldsData, []);

  const setBuilderOffset = () => {
    const nav = document.querySelector(".navbar");
    const navHeight = nav ? nav.offsetHeight : 56;
    document.documentElement.style.setProperty("--form-builder-top", `${navHeight}px`);
  };
  setBuilderOffset();
  window.addEventListener("resize", setBuilderOffset);

  const syncJsonInput = (schemaObject) => {
    const serialized = JSON.stringify(schemaObject || { elements: [] });
    hiddenJsonInput.value = serialized;
    if (jsonEditor) {
      jsonEditor.value = JSON.stringify(schemaObject || { elements: [] }, null, 2);
    }
  };

  const setSaveStatus = (state) => {
    if (!saveStatus) {
      return;
    }
    saveStatus.classList.remove("is-unsaved", "is-saving", "is-saved", "is-error");
    if (state === "unsaved") {
      saveStatus.textContent = "Unsaved";
      saveStatus.classList.add("is-unsaved");
      return;
    }
    if (state === "saving") {
      saveStatus.textContent = "Saving";
      saveStatus.classList.add("is-saving");
      return;
    }
    if (state === "error") {
      saveStatus.textContent = "Autosave Error";
      saveStatus.classList.add("is-error");
      return;
    }
    saveStatus.textContent = "Saved";
    saveStatus.classList.add("is-saved");
  };

  const showValidationError = (message) => {
    jsonError.textContent = message;
    jsonError.classList.remove("d-none");
  };

  const clearValidationError = () => {
    jsonError.classList.add("d-none");
  };

  const debounce = (fn, delayMs) => {
    let timer = null;
    return (...args) => {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        fn(...args);
      }, delayMs);
    };
  };

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

  const validateSchema = (parsed) => {
    if (!parsed || typeof parsed !== "object") {
      return "Survey JSON must be a valid object.";
    }
    const fieldNames = collectElements(parsed)
      .map((el) => el && el.name)
      .filter(Boolean);
    if (fieldNames.length === 0) {
      return "Survey JSON must include at least one field element.";
    }

    const normalized = new Set(fieldNames.map((name) => String(name).trim().toLowerCase()));
    const requiredGroups = requiredGroupsFromConfig
      .filter((group) => group && typeof group === "object")
      .map((group) => ({
        label: String(group.label || "").trim(),
        aliases: Array.isArray(group.aliases) ? group.aliases.map((alias) => String(alias || "").trim().toLowerCase()).filter(Boolean) : [],
      }))
      .filter((group) => group.label && group.aliases.length > 0);

    const missing = requiredGroups
      .filter((group) => !group.aliases.some((alias) => normalized.has(alias)))
      .map((group) => group.label);

    if (missing.length > 0) {
      return `Missing required fields: ${missing.join(", ")}`;
    }

    const strictRequired = strictRequiredFromConfig
      .map((field) => String(field || "").trim().toLowerCase())
      .filter(Boolean);
    const strictMissing = strictRequired.filter((field) => !normalized.has(field));
    if (strictMissing.length > 0) {
      return `Missing required system fields: ${strictMissing.join(", ")}`;
    }

    return null;
  };

  let creator = null;
  let autosaveRevision = 0;
  let lastSavedRevision = 0;

  const postAutosave = async (schemaObject, revision) => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/form-builder/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_json: schemaObject || { elements: [] } }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (revision >= lastSavedRevision) {
        lastSavedRevision = revision;
      }
      if (autosaveRevision === lastSavedRevision) {
        setSaveStatus("saved");
      }
    } catch (_error) {
      if (revision === autosaveRevision) {
        setSaveStatus("error");
      }
    }
  };

  const debouncedAutosave = debounce((schemaObject, revision) => {
    postAutosave(schemaObject, revision);
  }, 1000);

  try {
    if (!window.SurveyCreator || !window.SurveyCreator.SurveyCreator) {
      throw new Error("Survey Creator scripts not loaded");
    }

    creator = new SurveyCreator.SurveyCreator({
      autoSaveEnabled: false,
      collapseOnDrag: true,
      showPropertyGrid: false,
    });
    creator.showPropertyGrid = false;

    const updatePropertyButtonLabel = () => {
      if (!propertyPanelToggleBtn || !creator) {
        return;
      }
      const isPressed = creator.showPropertyGrid;
      propertyPanelToggleBtn.textContent = isPressed ? "Hide Properties" : "Show Properties";
      propertyPanelToggleBtn.setAttribute("aria-pressed", isPressed ? "true" : "false");
    };

    propertyPanelToggleBtn?.addEventListener("click", () => {
      if (!creator) {
        return;
      }
      creator.showPropertyGrid = !creator.showPropertyGrid;
      updatePropertyButtonLabel();
      console.debug("[FormBuilder] Toggled property panel", creator.showPropertyGrid ? "visible" : "hidden");
    });

    if (window.SurveyCreatorCore && window.SurveyCreatorTheme) {
      SurveyCreatorCore.registerCreatorTheme(SurveyCreatorTheme);
      const darkTheme =
        SurveyCreatorTheme.Dark ||
        SurveyCreatorTheme.dark ||
        SurveyCreatorTheme.DefaultDark ||
        Object.values(SurveyCreatorTheme).find((theme) => {
          return theme && typeof theme === "object" && String(theme.themeName || "").toLowerCase().includes("dark");
        });
      if (darkTheme && creator.applyCreatorTheme) {
        creator.applyCreatorTheme(darkTheme);
      }
    }

    const applySurveyPreviewTheme = (survey) => {
      if (
        survey &&
        typeof survey.applyTheme === "function" &&
        window.SurveyTheme &&
        window.SurveyTheme.LayeredDark
      ) {
        survey.applyTheme(window.SurveyTheme.LayeredDark);
      }
    };

    if (creator.onDesignerSurveyCreated && creator.onDesignerSurveyCreated.add) {
      creator.onDesignerSurveyCreated.add((_sender, options) => {
        applySurveyPreviewTheme(options && options.survey);
      });
    }
    if (creator.onPreviewSurveyCreated && creator.onPreviewSurveyCreated.add) {
      creator.onPreviewSurveyCreated.add((_sender, options) => {
        applySurveyPreviewTheme(options && options.survey);
      });
    }

    creator.showTranslationTab = false;
    creator.showLogicTab = true;
    creator.JSON = JSON.parse((hiddenJsonInput.value || "").trim() || '{"elements": []}');

    creator.saveSurveyFunc = (saveNo, callback) => {
      try {
        syncJsonInput(creator.JSON || { elements: [] });
        callback(saveNo, true);
      } catch (_error) {
        callback(saveNo, false);
      }
    };

    creator.render(creatorHost);
    updatePropertyButtonLabel();
    syncJsonInput(creator.JSON || { elements: [] });
    setSaveStatus("saved");

    if (creator.onModified && creator.onModified.add) {
      creator.onModified.add(() => {
        const schemaObject = creator.JSON || { elements: [] };
        syncJsonInput(schemaObject);
        autosaveRevision += 1;
        setSaveStatus("unsaved");
        debouncedAutosave(schemaObject, autosaveRevision);
      });
    }
  } catch (_error) {
    console.error("[FormBuilder] Survey Creator failed to initialize", _error);
    fallbackPanel?.classList.remove("d-none");
    if (creatorHost) {
      creatorHost.innerHTML =
        '<div class="p-3 small text-warning">Survey Creator failed to load. Using JSON fallback editor.</div>';
    }
    setSaveStatus("unsaved");
  }

  const runSave = (e) => {
    try {
      if (creator) {
        syncJsonInput(creator.JSON || { elements: [] });
      } else if (jsonEditor) {
        syncJsonInput(JSON.parse(jsonEditor.value.trim() || "{}"));
      }
    } catch (err) {
      if (e) e.preventDefault();
      showValidationError(`Invalid JSON: ${err.message}`);
      console.warn("[FormBuilder] JSON parse failed before save", err);
      jsonEditor?.focus();
      return;
    }

    try {
      const parsed = JSON.parse(hiddenJsonInput.value || "{}");
      const errorMessage = validateSchema(parsed);
      if (errorMessage) {
        if (e) e.preventDefault();
        showValidationError(errorMessage);
        console.warn("[FormBuilder] Validation error", errorMessage);
        jsonEditor?.focus();
        return;
      }
      clearValidationError();
      console.debug("[FormBuilder] Submitting schema save");
      form.submit();
    } catch (err) {
      if (e) e.preventDefault();
      showValidationError(`Invalid JSON: ${err.message}`);
      console.warn("[FormBuilder] JSON parse failed", err);
      jsonEditor?.focus();
    }
  };

  saveBtn?.addEventListener("click", runSave);

  jsonEditor?.addEventListener("input", () => {
    clearValidationError();
  });
});
