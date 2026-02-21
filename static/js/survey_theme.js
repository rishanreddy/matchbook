/* Shared SurveyJS theme integration for Form Library and Creator. */
(function initAppSurveyTheme() {
  "use strict";

  const root = document.documentElement;

  function cssToken(name, fallback) {
    const value = getComputedStyle(root).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getAppTokens() {
    return {
      bg: cssToken("--app-bg", "#0f1115"),
      surface: cssToken("--app-surface", "#151922"),
      surface2: cssToken("--app-surface-2", "#1d2330"),
      surface3: cssToken("--app-surface-3", "#232a38"),
      border: cssToken("--app-border", "#2b3342"),
      text: cssToken("--app-text", "#f1f5f9"),
      muted: cssToken("--app-muted", "#94a3b8"),
      accent: cssToken("--app-accent", "#0d6efd"),
      accentDim: cssToken("--app-accent-dim", "rgba(13, 110, 253, 0.2)"),
      danger: cssToken("--app-danger", "#dc3545"),
    };
  }

  function cloneTheme(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err) {
      return { ...value };
    }
  }

  function firstTheme(themeObject, candidates) {
    if (!themeObject || typeof themeObject !== "object") {
      return null;
    }
    for (const key of candidates) {
      if (themeObject[key] && typeof themeObject[key] === "object") {
        return themeObject[key];
      }
    }
    return null;
  }

  function getBaseFormTheme() {
    return firstTheme(window.SurveyTheme, [
      "LayeredDarkPanelless",
      "LayeredDark",
      "DefaultDark",
      "ContrastDark",
    ]);
  }

  function getBaseCreatorTheme() {
    return firstTheme(window.SurveyCreatorTheme, [
      "DefaultDark",
      "Dark",
      "dark",
      "SC2020",
    ]);
  }

  function buildFormTheme() {
    const tokens = getAppTokens();
    const baseTheme = cloneTheme(getBaseFormTheme());
    const cssVariables = {
      ...(baseTheme.cssVariables || {}),
      "--sjs-primary-backcolor": tokens.accent,
      "--sjs-primary-backcolor-light": tokens.accentDim,
      "--sjs-primary-forecolor": "#ffffff",
      "--sjs-general-backcolor": tokens.surface,
      "--sjs-general-backcolor-dark": tokens.bg,
      "--sjs-general-dim-color": tokens.border,
      "--sjs-general-forecolor": tokens.text,
      "--sjs-secondary-backcolor": tokens.surface2,
      "--sjs-secondary-forecolor": tokens.text,
      "--sjs-editorpanel-backcolor": tokens.surface,
      "--sjs-editorpanel-hovercolor": tokens.surface3,
      "--sjs-shadow-small": "0 1px 2px rgba(0, 0, 0, 0.35)",
    };

    return {
      ...baseTheme,
      themeName: baseTheme.themeName || "layered",
      colorPalette: "dark",
      isPanelless:
        typeof baseTheme.isPanelless === "boolean" ? baseTheme.isPanelless : true,
      cssVariables,
    };
  }

  function buildCreatorTheme() {
    const tokens = getAppTokens();
    const baseTheme = cloneTheme(getBaseCreatorTheme());
    const cssVariables = {
      ...(baseTheme.cssVariables || {}),
      "--sjs-primary-background-500": tokens.accent,
      "--sjs-primary-background-10": tokens.accentDim,
      "--sjs-secondary-background-500": tokens.accent,
      "--sjs-secondary-background-10": tokens.accentDim,
      "--sjs-layer-1-background-500": tokens.surface,
      "--sjs-layer-2-background-500": tokens.surface2,
      "--sjs-layer-3-background-500": tokens.surface3,
      "--sjs-layer-1-foreground-100": tokens.text,
      "--sjs-layer-1-foreground-75": tokens.text,
      "--sjs-layer-1-foreground-50": tokens.muted,
      "--sjs-layer-3-foreground-100": tokens.text,
      "--sjs-layer-3-foreground-75": tokens.muted,
      "--sjs-border-25": tokens.border,
      "--sjs-special-background": tokens.bg,
      "--sjs-semantic-red-background-500": tokens.danger,
    };

    return {
      ...baseTheme,
      themeName: baseTheme.themeName || "default",
      colorPalette: "dark",
      cssVariables,
    };
  }

  function applyFormTheme(survey) {
    if (!survey || typeof survey.applyTheme !== "function") {
      return false;
    }

    try {
      survey.applyTheme(buildFormTheme());
      return true;
    } catch (_err) {
      const fallback = getBaseFormTheme();
      if (fallback) {
        try {
          survey.applyTheme(fallback);
          return true;
        } catch (_fallbackErr) {
          return false;
        }
      }
      return false;
    }
  }

  function applyCreatorTheme(creator) {
    if (!creator || typeof creator.applyCreatorTheme !== "function") {
      return false;
    }

    try {
      if (window.SurveyCreatorCore && window.SurveyCreatorTheme) {
        window.SurveyCreatorCore.registerCreatorTheme(window.SurveyCreatorTheme);
      }
      creator.applyCreatorTheme(buildCreatorTheme());
      return true;
    } catch (_err) {
      const fallback = getBaseCreatorTheme();
      if (fallback) {
        try {
          creator.applyCreatorTheme(fallback);
          return true;
        } catch (_fallbackErr) {
          return false;
        }
      }
      return false;
    }
  }

  window.AppSurveyTheme = {
    getAppTokens,
    buildFormTheme,
    buildCreatorTheme,
    applyFormTheme,
    applyCreatorTheme,
  };
})();
