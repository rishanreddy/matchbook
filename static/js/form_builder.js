/* Initializes SurveyJS form builder and graph mapping settings. */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formBuilderForm");
  const saveBtn = document.getElementById("saveFormBtn");
  const hiddenJsonInput = document.getElementById("surveyJsonInput");
  const graphConfigInput = document.getElementById("graphConfigInput");
  const graphConfigBody = document.getElementById("graphConfigBody");
  const graphSettingsBtn = document.getElementById("graphSettingsBtn");
  const graphSettingsModalEl = document.getElementById("graphSettingsModal");
  const jsonEditor = document.getElementById("surveyJsonEditor");
  const fallbackPanel = document.getElementById("jsonFallbackPanel");
  const jsonError = document.getElementById("jsonValidationError");
  const creatorHost = document.getElementById("surveyCreatorHost");

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

  const parseGraphConfig = () => {
    try {
      const parsed = JSON.parse(graphConfigInput.value || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  };

  const collectFieldInfo = (schemaObject) => {
    const names = new Set();
    return collectElements(schemaObject)
      .map((el) => ({
        name: el && el.name,
        title: (el && el.title) || (el && el.name),
      }))
      .filter((item) => item.name && !names.has(item.name) && names.add(item.name));
  };

  const syncGraphTable = (schemaObject) => {
    const fields = collectFieldInfo(schemaObject || {});
    const config = parseGraphConfig();
    const configByField = {};
    config.forEach((item) => {
      if (item && item.field) {
        configByField[item.field] = item;
      }
    });

    graphConfigBody.innerHTML = "";
    fields.forEach((field) => {
      const existing = configByField[field.name] || {};
      const row = document.createElement("tr");
      row.setAttribute("data-field", field.name);

      const isSystemField = ["team", "auto_score", "teleop_score"].includes(field.name);
      const enabled = isSystemField ? true : existing.chart_type !== undefined;
      const chartType = (existing.chart_type || "line").toLowerCase();

      row.innerHTML = `
          <td>
            <div class="fw-semibold">${field.title || field.name}</div>
            <div class="small text-muted-app"><code>${field.name}</code>${isSystemField ? " · system" : ""}</div>
          </td>
          <td>
            <input class="form-check-input graph-enabled" type="checkbox" ${enabled ? "checked" : ""} ${isSystemField ? "disabled" : ""}>
          </td>
          <td>
            <select class="form-select form-select-sm graph-type" ${enabled ? "" : "disabled"}>
              <option value="line" ${chartType === "line" ? "selected" : ""}>Line</option>
              <option value="bar" ${chartType === "bar" ? "selected" : ""}>Bar</option>
              <option value="radar" ${chartType === "radar" ? "selected" : ""}>Radar</option>
              <option value="pie" ${chartType === "pie" ? "selected" : ""}>Pie</option>
              <option value="doughnut" ${chartType === "doughnut" ? "selected" : ""}>Doughnut</option>
            </select>
          </td>
        `;

      graphConfigBody.appendChild(row);
    });
  };

  const syncGraphConfigInput = () => {
    const rows = [...graphConfigBody.querySelectorAll("tr[data-field]")];
    const payload = rows
      .map((row) => {
        const field = row.getAttribute("data-field") || "";
        const enabled = row.querySelector(".graph-enabled")?.checked;
        const chartType = row.querySelector(".graph-type")?.value || "line";
        return { field, enabled, chart_type: chartType };
      })
      .filter((item) => item.field && item.enabled)
      .map((item) => ({ field: item.field, chart_type: item.chart_type }));

    graphConfigInput.value = JSON.stringify(payload);
  };

  const showValidationError = (message) => {
    jsonError.textContent = message;
    jsonError.classList.remove("d-none");
  };

  const clearValidationError = () => {
    jsonError.classList.add("d-none");
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
    return null;
  };

  let creator = null;
  try {
    if (!window.SurveyCreator || !window.SurveyCreator.SurveyCreator) {
      throw new Error("Survey Creator scripts not loaded");
    }

    creator = new SurveyCreator.SurveyCreator({
      autoSaveEnabled: false,
      collapseOnDrag: true,
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
    syncJsonInput(creator.JSON || { elements: [] });
    syncGraphTable(creator.JSON || { elements: [] });

    if (creator.onModified && creator.onModified.add) {
      creator.onModified.add(() => {
        syncGraphTable(creator.JSON || { elements: [] });
      });
    }
  } catch (_error) {
    fallbackPanel?.classList.remove("d-none");
    if (creatorHost) {
      creatorHost.innerHTML =
        '<div class="p-3 small text-warning">Survey Creator failed to load. Using JSON fallback editor.</div>';
    }
  }

  const runSave = (e) => {
    try {
      if (creator) {
        syncJsonInput(creator.JSON || { elements: [] });
        syncGraphTable(creator.JSON || { elements: [] });
      } else if (jsonEditor) {
        syncJsonInput(JSON.parse(jsonEditor.value.trim() || "{}"));
        syncGraphTable(JSON.parse(jsonEditor.value.trim() || "{}"));
      }
    } catch (err) {
      if (e) e.preventDefault();
      showValidationError(`Invalid JSON: ${err.message}`);
      jsonEditor?.focus();
      return;
    }

    try {
      const parsed = JSON.parse(hiddenJsonInput.value || "{}");
      const errorMessage = validateSchema(parsed);
      if (errorMessage) {
        if (e) e.preventDefault();
        showValidationError(errorMessage);
        jsonEditor?.focus();
        return;
      }
      clearValidationError();
      syncGraphConfigInput();
      form.submit();
    } catch (err) {
      if (e) e.preventDefault();
      showValidationError(`Invalid JSON: ${err.message}`);
      jsonEditor?.focus();
    }
  };

  saveBtn?.addEventListener("click", runSave);

  graphConfigBody?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.classList.contains("graph-enabled")) {
      const row = target.closest("tr[data-field]");
      const typeInput = row?.querySelector(".graph-type");
      if (typeInput instanceof HTMLSelectElement) {
        typeInput.disabled = !(target instanceof HTMLInputElement && target.checked);
      }
    }

    syncGraphConfigInput();
  });

  graphConfigBody?.addEventListener("input", () => {
    syncGraphConfigInput();
  });

  if (graphSettingsModalEl && window.bootstrap && window.bootstrap.Modal) {
    const graphSettingsModal = window.bootstrap.Modal.getOrCreateInstance(graphSettingsModalEl);

    graphSettingsBtn?.addEventListener("click", () => {
      let schema = {};
      try {
        schema = creator ? creator.JSON : JSON.parse(hiddenJsonInput.value || "{}");
      } catch (_error) {
        schema = {};
      }
      syncGraphTable(schema || {});
      syncGraphConfigInput();
      graphSettingsModal.show();
    });

    graphSettingsModalEl.addEventListener("hidden.bs.modal", () => {
      syncGraphConfigInput();
    });
  } else {
    graphSettingsBtn?.addEventListener("click", () => {
      let schema = {};
      try {
        schema = creator ? creator.JSON : JSON.parse(hiddenJsonInput.value || "{}");
      } catch (_error) {
        schema = {};
      }
      syncGraphTable(schema || {});
      syncGraphConfigInput();
    });
  }

  jsonEditor?.addEventListener("input", () => {
    clearValidationError();
  });
});
