/* Renders team trend charts and radar overview. */
document.addEventListener("DOMContentLoaded", () => {
  const teamInfoData = window.teamInfoData || {};
  if (!teamInfoData.showTrends) {
    return;
  }

  const matches = Array.isArray(teamInfoData.matches) ? teamInfoData.matches : [];
  const choiceLabelMaps = teamInfoData.choiceLabelMaps || {};
  const choiceDisplayEntries = teamInfoData.choiceDisplayEntries || {};
  const fieldTypes = teamInfoData.fieldTypes || {};
  const graphFields = Array.isArray(teamInfoData.graphFields) ? teamInfoData.graphFields : [];
  const showRadar = Boolean(teamInfoData.showRadar);
  const radarDataByField = teamInfoData.radarDataByField || {};
  const radarDataValues = Array.isArray(teamInfoData.radarDataValues)
    ? teamInfoData.radarDataValues
    : [];
  const matchLabels = matches.map((m) => String(m.match || "N/A"));

  const multiSelectTypes = new Set(["checkbox", "tagbox"]);
  const categoricalTypes = new Set(["dropdown", "radiogroup", "boolean", "checkbox", "tagbox", "ranking"]);
  const unsupportedTypes = new Set([
    "matrix",
    "matrixdropdown",
    "matrixdynamic",
    "paneldynamic",
    "multipletext",
    "file",
    "imagepicker",
    "signaturepad",
    "html",
    "expression",
  ]);

  const categoricalPalette = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  const getFieldType = (fieldName) => String(fieldTypes[fieldName] || "").trim().toLowerCase();
  const isMultiSelectField = (fieldName) => multiSelectTypes.has(getFieldType(fieldName));
  const isCategoricalField = (fieldName) => categoricalTypes.has(getFieldType(fieldName));
  const isUnsupportedField = (fieldName) => unsupportedTypes.has(getFieldType(fieldName));

  const addFallbackNote = (canvasEl, text) => {
    if (!canvasEl || !canvasEl.parentElement) {
      return;
    }
    const noteEl = document.createElement("div");
    noteEl.className = "chart-fallback-note";
    noteEl.textContent = text;
    canvasEl.parentElement.insertBefore(noteEl, canvasEl);
  };

  const splitMultiValues = (rawValue, allowDelimitedSplit = false) => {
    const text = String(rawValue || "").trim();
    if (!text) {
      return [];
    }

    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
      } catch (_error) {
        // Fall through.
      }
    }

    if (allowDelimitedSplit && text.includes(",")) {
      return text.split(",").map((chunk) => chunk.trim()).filter(Boolean);
    }
    if (allowDelimitedSplit && text.includes(";")) {
      return text.split(";").map((chunk) => chunk.trim()).filter(Boolean);
    }

    return [text];
  };

  const decodeChoiceLabel = (fieldName, rawValue) => {
    const map = choiceLabelMaps[fieldName] || {};
    const values = splitMultiValues(rawValue, isMultiSelectField(fieldName));
    if (values.length === 0) {
      return String(rawValue || "").trim();
    }

    return values
      .map((value) => map[String(value).trim().toLowerCase()] || value)
      .join(", ");
  };

  const resolveMeaningLabel = (fieldName, rawValue, numericValue) => {
    const map = choiceLabelMaps[fieldName] || {};
    const rawKey = String(rawValue || "").trim().toLowerCase();
    if (rawKey && map[rawKey]) {
      return map[rawKey];
    }

    const numericKey = String(numericValue).trim().toLowerCase();
    if (numericKey && map[numericKey]) {
      return map[numericKey];
    }

    const decoded = decodeChoiceLabel(fieldName, rawValue);
    if (decoded && decoded !== String(rawValue || "").trim() && decoded !== String(numericValue)) {
      return decoded;
    }
    return "";
  };

  const ensureMeaningLegend = (fieldName, canvasEl) => {
    const entries = Array.isArray(choiceDisplayEntries[fieldName]) ? choiceDisplayEntries[fieldName] : [];
    if (!entries.length || !canvasEl || !canvasEl.parentElement) {
      return;
    }

    const legendEl = document.createElement("div");
    legendEl.className = "small text-muted-app mt-2";
    legendEl.textContent = `Value legend: ${entries.map((entry) => `${entry.value}=${entry.label}`).join(" | ")}`;
    canvasEl.parentElement.appendChild(legendEl);
  };

  const buildCategoricalMap = (fieldName) => {
    const configuredEntries = Array.isArray(choiceDisplayEntries[fieldName]) ? choiceDisplayEntries[fieldName] : [];
    if (configuredEntries.length > 0) {
      const configuredMap = {};
      configuredEntries.forEach((entry, index) => {
        const score = index + 1;
        const valueKey = String(entry.value || "").trim().toLowerCase();
        const labelKey = String(entry.label || "").trim().toLowerCase();
        if (valueKey) {
          configuredMap[valueKey] = score;
        }
        if (labelKey) {
          configuredMap[labelKey] = score;
        }
      });
      return configuredMap;
    }

    const discovered = [];
    const seen = new Set();
    matches.forEach((match) => {
      const raw = String(match[fieldName] || "").trim().toLowerCase();
      if (!raw || seen.has(raw)) {
        return;
      }
      seen.add(raw);
      discovered.push(raw);
    });

    const result = {};
    discovered.forEach((value, idx) => {
      result[value] = idx + 1;
    });
    return result;
  };

  const parseNumericLike = (value, categoricalMap, allowDelimitedSplit = false) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    const text = String(value || "").trim();
    if (!text) {
      return null;
    }

    const multiValues = splitMultiValues(text, allowDelimitedSplit);
    if (multiValues.length > 1) {
      const parsedValues = multiValues
        .map((item) => parseNumericLike(item, categoricalMap, false))
        .filter((item) => typeof item === "number" && Number.isFinite(item));
      if (parsedValues.length > 0) {
        return Math.max(...parsedValues);
      }
    }

    const direct = Number.parseFloat(text);
    if (!Number.isNaN(direct)) {
      return direct;
    }

    const lowered = text.toLowerCase();
    if (["yes", "true", "complete", "completed", "pass"].includes(lowered)) {
      return 1;
    }
    if (["no", "false", "failed", "fail", "incomplete"].includes(lowered)) {
      return 0;
    }

    const embedded = lowered.match(/-?\d+(\.\d+)?/);
    if (embedded) {
      return Number.parseFloat(embedded[0]);
    }

    if (categoricalMap && Object.prototype.hasOwnProperty.call(categoricalMap, lowered)) {
      return categoricalMap[lowered];
    }

    return null;
  };

  const categoryColorFor = (fieldName, label, index) => {
    const normalized = String(label || "").trim().toLowerCase();
    if (fieldName === "alliance_color") {
      if (normalized === "red") {
        return "#ef4444";
      }
      if (normalized === "blue") {
        return "#3b82f6";
      }
    }
    return categoricalPalette[index % categoricalPalette.length];
  };

  const buildCategoricalDistribution = (fieldName, multiSelect) => {
    const configuredEntries = Array.isArray(choiceDisplayEntries[fieldName]) ? choiceDisplayEntries[fieldName] : [];
    const counts = new Map();
    configuredEntries.forEach((entry) => {
      const label = String(entry.label || entry.value || "").trim();
      if (label) {
        counts.set(label, 0);
      }
    });

    matches.forEach((match) => {
      const raw = match[fieldName];
      const tokens = splitMultiValues(raw, multiSelect);
      if (!tokens.length) {
        return;
      }

      const labelsInMatch = new Set(
        tokens
          .map((token) => String(decodeChoiceLabel(fieldName, token) || token || "").trim())
          .filter(Boolean),
      );

      if (multiSelect) {
        labelsInMatch.forEach((label) => {
          counts.set(label, (counts.get(label) || 0) + 1);
        });
      } else {
        const firstLabel = labelsInMatch.values().next().value;
        if (firstLabel) {
          counts.set(firstLabel, (counts.get(firstLabel) || 0) + 1);
        }
      }
    });

    const labels = [];
    const values = [];
    counts.forEach((count, label) => {
      if (count > 0) {
        labels.push(label);
        values.push(count);
      }
    });
    return { labels, values };
  };

  const buildPresenceDistribution = (fieldName) => {
    let withData = 0;
    let withoutData = 0;
    matches.forEach((match) => {
      const value = String(match[fieldName] || "").trim();
      if (value) {
        withData += 1;
      } else {
        withoutData += 1;
      }
    });
    const labels = [];
    const values = [];
    if (withData > 0) {
      labels.push("Has response");
      values.push(withData);
    }
    if (withoutData > 0) {
      labels.push("No response");
      values.push(withoutData);
    }
    return { labels, values };
  };

  graphFields.forEach((fieldConfig) => {
    const fieldName = fieldConfig.field;
    const multiSelect = isMultiSelectField(fieldName);
    const categorical = isCategoricalField(fieldName);
    const unsupported = isUnsupportedField(fieldName);
    const categoricalMap = buildCategoricalMap(fieldName);
    const trendData = matches.map((m) => parseNumericLike(m[fieldName], categoricalMap, multiSelect));
    const validTrendValues = trendData.filter((item) => typeof item === "number" && Number.isFinite(item));
    const trendHasData = validTrendValues.length > 0;

    const categoryDistribution = buildCategoricalDistribution(fieldName, multiSelect);
    const presenceDistribution = buildPresenceDistribution(fieldName);

    const canvas = document.getElementById(`chart-${fieldName}`);
    if (!canvas) {
      return;
    }

    const requestedType = String(fieldConfig.chart_type || "line").toLowerCase();
    let chartType = requestedType;
    let mode = "trend";

    if (requestedType === "radar") {
      chartType = categorical ? "bar" : "line";
      mode = categorical ? "distribution" : "trend";
      addFallbackNote(canvas, "Per-field radar is not meaningful. Using a clearer chart type instead.");
    }

    if (requestedType === "pie" || requestedType === "doughnut") {
      if (unsupported) {
        chartType = "bar";
        mode = "presence";
        addFallbackNote(canvas, "This question type cannot be pie-charted directly. Showing response coverage instead.");
      } else {
        mode = "distribution";
        const distinct = new Set(categoryDistribution.labels).size;
        if (distinct < 2) {
          chartType = "bar";
          addFallbackNote(canvas, "Need at least two categories for pie/doughnut. Showing bar chart instead.");
        }
      }
    }

    if (chartType === "line" || chartType === "bar") {
      if (unsupported) {
        chartType = "bar";
        mode = "presence";
        addFallbackNote(canvas, "This question type is not numeric trend data. Showing response coverage.");
      } else if (categorical) {
        if (chartType === "line") {
          addFallbackNote(canvas, "Categorical field selected. Showing bar distribution instead of a line trend.");
        }
        chartType = "bar";
        mode = "distribution";
      } else if (!trendHasData) {
        chartType = "bar";
        mode = "presence";
        addFallbackNote(canvas, "No numeric values found. Showing response coverage.");
      }
    }

    const isPieOrDoughnut = chartType === "pie" || chartType === "doughnut";
    const isDistributionLike = mode === "distribution" || mode === "presence";
    const labels = isDistributionLike
      ? (mode === "distribution" ? categoryDistribution.labels : presenceDistribution.labels)
      : matchLabels;
    const values = isDistributionLike
      ? (mode === "distribution" ? categoryDistribution.values : presenceDistribution.values)
      : trendData;

    const totalDistribution = isDistributionLike
      ? values.reduce((acc, value) => acc + Number(value || 0), 0)
      : 0;
    const backgroundColor = isDistributionLike
      ? labels.map((label, idx) => `${categoryColorFor(fieldName, label, idx)}AA`)
      : `${fieldConfig.color}33`;
    const borderColor = isDistributionLike
      ? labels.map((label, idx) => categoryColorFor(fieldName, label, idx))
      : fieldConfig.color;

    const options = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: isPieOrDoughnut,
          labels: { color: "#a99fc5" },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (isDistributionLike) {
                const count = Number(context.raw || 0);
                const pct = totalDistribution > 0 ? ((count / totalDistribution) * 100).toFixed(1) : "0.0";
                return `${context.label}: ${count} (${pct}%)`;
              }

              const numericValue = context.parsed && typeof context.parsed.y === "number"
                ? context.parsed.y
                : context.raw;
              if (numericValue === null || numericValue === undefined || Number.isNaN(Number(numericValue))) {
                return `${fieldConfig.label}: No data`;
              }

              const rawValue = (matches[context.dataIndex] || {})[fieldName];
              const meaning = resolveMeaningLabel(fieldName, rawValue, numericValue);
              const lines = [`${fieldConfig.label}: ${numericValue}`];
              if (meaning) {
                lines.push(`Meaning: ${meaning}`);
              }
              return lines;
            },
          },
        },
      },
    };

    if (!isPieOrDoughnut) {
      options.scales = {
        x: { ticks: { color: "#94a3b8" } },
        y: {
          beginAtZero: true,
          ticks: { color: "#94a3b8" },
        },
      };
    }

    if (typeof Chart.getChart === "function") {
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }
    }

    new Chart(canvas, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: fieldConfig.label,
            data: values,
            backgroundColor,
            borderColor,
            borderWidth: 2,
            tension: chartType === "line" ? 0.4 : 0,
            spanGaps: chartType === "line",
            pointBackgroundColor: fieldConfig.color,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: chartType === "line" ? 3 : 0,
            pointHoverRadius: chartType === "line" ? 5 : 0,
          },
        ],
      },
      options,
    });

    if (!isDistributionLike) {
      ensureMeaningLegend(fieldName, canvas);
    }
  });

  if (!showRadar) {
    return;
  }

  const radarCanvas = document.getElementById("radar-chart");
  if (!radarCanvas) {
    return;
  }

  const radarCategories = graphFields.map((fieldConfig) => fieldConfig.label);
  const seriesColors = graphFields.map((fieldConfig) => fieldConfig.color || "#f59e0b");
  const normalizedRadarValues = graphFields.map((fieldConfig, idx) => {
    const fromMap = radarDataByField[fieldConfig.field];
    if (typeof fromMap === "number" && Number.isFinite(fromMap)) {
      return fromMap;
    }
    const fallback = radarDataValues[idx];
    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0;
  });

  const hasVariation = new Set(normalizedRadarValues).size > 1;
  const hasEnoughCategories = radarCategories.length >= 3;
  if (!hasEnoughCategories || !hasVariation) {
    const radarCard = radarCanvas.closest(".card");
    if (radarCard) {
      const noteEl = document.createElement("div");
      noteEl.className = "chart-fallback-note";
      noteEl.style.margin = "var(--space-4)";
      noteEl.textContent = hasEnoughCategories
        ? "Radar chart hidden: no variation in performance metrics across matches."
        : "Radar chart hidden: need at least 3 metrics for meaningful comparison.";
      const cardBody = radarCard.querySelector(".card-body");
      if (cardBody) {
        cardBody.appendChild(noteEl);
      }
      radarCanvas.style.display = "none";
    }
    return;
  }

  const gradient = radarCanvas
    .getContext("2d")
    .createRadialGradient(
      radarCanvas.width / 2,
      radarCanvas.height / 2,
      20,
      radarCanvas.width / 2,
      radarCanvas.height / 2,
      240,
    );
  gradient.addColorStop(0, "rgba(245, 158, 11, 0.38)");
  gradient.addColorStop(1, "rgba(245, 158, 11, 0.10)");

  if (typeof Chart.getChart === "function") {
    const existingRadar = Chart.getChart(radarCanvas);
    if (existingRadar) {
      existingRadar.destroy();
    }
  }

  new Chart(radarCanvas, {
    type: "radar",
    data: {
      labels: radarCategories,
      datasets: [
        {
          label: `Team ${teamInfoData.teamNumber || ""}`.trim(),
          data: normalizedRadarValues,
          backgroundColor: gradient,
          borderColor: "#f59e0b",
          borderWidth: 3,
          pointBackgroundColor: seriesColors,
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Best Observed Baseline",
          data: graphFields.map(() => 100),
          backgroundColor: "rgba(122, 112, 144, 0.06)",
          borderColor: "rgba(169, 159, 197, 0.7)",
          borderDash: [6, 6],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: "#a99fc5",
            usePointStyle: true,
            boxWidth: 14,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          pointLabels: { color: "#a99fc5" },
          ticks: {
            color: "#7a7090",
            stepSize: 20,
            backdropColor: "rgba(26, 24, 37, 0.72)",
          },
          grid: { color: "rgba(61, 56, 80, 0.38)" },
          angleLines: { color: "rgba(61, 56, 80, 0.3)" },
        },
      },
    },
  });
});
