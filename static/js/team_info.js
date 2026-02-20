/* Renders team trend charts and radar overview. */
document.addEventListener("DOMContentLoaded", () => {
  const teamInfoData = window.teamInfoData || {};
  if (!teamInfoData.showTrends) {
    return;
  }

  const matches = teamInfoData.matches || [];
  const graphFields = teamInfoData.graphFields || [];
  const showRadar = Boolean(teamInfoData.showRadar);
  const radarDataValues = teamInfoData.radarDataValues || [];
  const matchLabels = matches.map((m) => m.match || "N/A");

  graphFields.forEach((fieldConfig) => {
    const fieldName = fieldConfig.field;
    const fieldData = matches.map((m) => {
      const val = parseFloat(m[fieldName]);
      return Number.isNaN(val) ? 0 : val;
    });

    const ctx = document.getElementById(`chart-${fieldName}`);
    if (!ctx) {
      return;
    }

    new Chart(ctx, {
      type: fieldConfig.chart_type,
      data: {
        labels: matchLabels,
        datasets: [
          {
            label: fieldConfig.label,
            data: fieldData,
            backgroundColor: `${fieldConfig.color}33`,
            borderColor: fieldConfig.color,
            borderWidth: 2,
            tension: 0.4,
            pointBackgroundColor: fieldConfig.color,
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { beginAtZero: true, ticks: { color: "#94a3b8" } },
        },
      },
    });
  });

  if (!showRadar) {
    return;
  }

  const radarCategories = graphFields.map((fieldConfig) => fieldConfig.label);
  const ctxRadar = document.getElementById("radar-chart");
  if (!ctxRadar) {
    return;
  }

  new Chart(ctxRadar, {
    type: "radar",
    data: {
      labels: radarCategories,
      datasets: [
        {
          label: "Relative Score",
          data: radarDataValues,
          backgroundColor: "rgba(59, 130, 246, 0.2)",
          borderColor: "rgb(59, 130, 246)",
          borderWidth: 2,
          pointBackgroundColor: "rgb(59, 130, 246)",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { labels: { color: "#94a3b8" } } },
      scales: {
        r: {
          beginAtZero: true,
          pointLabels: { color: "#94a3b8" },
          ticks: { color: "#94a3b8", backdropColor: "transparent" },
        },
      },
    },
  });
});
