import type { TraceReport } from "./trace-report"

export function renderTraceReportHtml(report: TraceReport): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.run.runId)} trace report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --ink: #1d2430;
      --muted: #667085;
      --line: #d9dee7;
      --panel: #ffffff;
      --accent: #0b6bcb;
      --good: #16794c;
      --warn: #a15c00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
      padding: 20px clamp(16px, 4vw, 40px);
    }
    main {
      display: grid;
      gap: 20px;
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px clamp(16px, 4vw, 40px) 40px;
    }
    h1, h2 { margin: 0; line-height: 1.2; letter-spacing: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 16px; }
    .subtle { color: var(--muted); margin-top: 6px; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
    }
    .metric { display: grid; gap: 4px; }
    .metric strong { font-size: 20px; line-height: 1.15; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border-bottom: 1px solid var(--line); padding: 9px 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 650; text-transform: uppercase; }
    td { overflow-wrap: anywhere; }
    .status { color: var(--accent); font-weight: 650; }
    .passed { color: var(--good); }
    .failed { color: var(--warn); }
    .timeline-kind { color: var(--muted); font-variant-numeric: tabular-nums; }
    code { background: #eef1f5; border-radius: 4px; padding: 1px 4px; }
    footer { color: var(--muted); font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.run.runId)}</h1>
    <div class="subtle">Trace report for local inspection UX. Benchmark authority remains the evaluator registry and DoneClaim evidence.</div>
  </header>
  <main>
    <section class="grid" aria-label="Run summary">
      ${metric("Actions", report.actions.length)}
      ${metric("Observations", report.observations.length)}
      ${metric("Events", report.events.length)}
      ${metric("Same-action streak", report.metrics.sameActionStreak)}
      ${metric("Tool error rate", formatRatio(report.metrics.toolErrorRate))}
      ${metric("Visual novelty", formatRatio(report.metrics.visualStateNovelty))}
    </section>
    <section class="panel">
      <h2>Objective status</h2>
      ${renderObjectives(report)}
    </section>
    <section class="panel">
      <h2>Action timeline</h2>
      ${renderTimeline(report)}
    </section>
    <section class="panel">
      <h2>Screenshot metadata</h2>
      ${renderScreenshots(report)}
    </section>
    <section class="panel">
      <h2>Run diff</h2>
      ${renderDiff(report)}
    </section>
    <footer>Source trace: <code>${escapeHtml(report.traceDir)}</code></footer>
  </main>
</body>
</html>`
}

function renderObjectives(report: TraceReport): string {
  if (report.objectiveResults.length === 0) {
    return '<p class="subtle">No objective records were found in this trace.</p>'
  }
  return `<table>
    <thead><tr><th>Objective</th><th>Status</th><th>Summary</th><th>Evidence</th></tr></thead>
    <tbody>${report.objectiveResults
      .map(
        (objective) => `<tr>
          <td>${escapeHtml(objective.objectiveId)}</td>
          <td class="status ${escapeHtml(objective.status)}">${escapeHtml(objective.status)}</td>
          <td>${escapeHtml(objective.summary)}</td>
          <td>${escapeHtml(objective.evidence.join("; "))}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`
}

function renderTimeline(report: TraceReport): string {
  return `<table>
    <thead><tr><th>Time</th><th>Kind</th><th>Label</th><th>Detail</th></tr></thead>
    <tbody>${report.timeline
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.timestamp || "untimed")}</td>
          <td class="timeline-kind">${escapeHtml(item.kind)}</td>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(item.detail)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`
}

function renderScreenshots(report: TraceReport): string {
  if (report.screenshotMetadata.length === 0) {
    return '<p class="subtle">No screenshot metadata was recorded.</p>'
  }
  return `<table>
    <thead><tr><th>Turn</th><th>Kind</th><th>Frame</th><th>Size</th><th>Base64 bytes</th></tr></thead>
    <tbody>${report.screenshotMetadata
      .map(
        (shot) => `<tr>
          <td>${escapeHtml(formatOptional(shot.turn))}</td>
          <td>${escapeHtml(shot.kind)}</td>
          <td>${escapeHtml(formatOptional(shot.frame))}</td>
          <td>${escapeHtml(formatSize(shot.width, shot.height))}</td>
          <td>${escapeHtml(formatOptional(shot.pngBase64Length))}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`
}

function renderDiff(report: TraceReport): string {
  if (report.diff === undefined) {
    return '<p class="subtle">No comparison run selected.</p>'
  }
  return `<p>Compared with <code>${escapeHtml(report.diff.runId)}</code>: actions ${formatDelta(
    report.diff.actionDelta,
  )}, observations ${formatDelta(report.diff.observationDelta)}, events ${formatDelta(
    report.diff.eventDelta,
  )}, same-action streak ${formatDelta(report.diff.sameActionStreakDelta)}.</p>`
}

function metric(label: string, value: string | number): string {
  return `<div class="panel metric"><span class="subtle">${escapeHtml(label)}</span><strong>${escapeHtml(
    String(value),
  )}</strong></div>`
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function formatOptional(value: number | undefined): string {
  return value === undefined ? "unknown" : String(value)
}

function formatSize(width: number | undefined, height: number | undefined): string {
  return width === undefined || height === undefined ? "unknown" : `${width}x${height}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
