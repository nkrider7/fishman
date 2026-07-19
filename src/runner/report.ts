import type { RunnerConfig, RunnerItemResult } from "./types";

export interface RunnerReportInput {
  config: RunnerConfig;
  environmentName?: string;
  startedAt: number;
  finishedAt: number;
  results: RunnerItemResult[];
}

function counts(results: RunnerItemResult[]) {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildJsonReport(input: RunnerReportInput): string {
  const summary = counts(input.results);
  return JSON.stringify(
    {
      collection: input.config.collectionName,
      environment: input.environmentName ?? null,
      startedAt: new Date(input.startedAt).toISOString(),
      finishedAt: new Date(input.finishedAt).toISOString(),
      durationMs: input.finishedAt - input.startedAt,
      summary,
      config: {
        delayMs: input.config.delayMs,
        parallel: input.config.parallel,
        iterations: input.config.iterations,
        stopOnFailure: input.config.stopOnFailure,
        failOnHttpError: input.config.failOnHttpError,
        dataFileName: input.config.dataFileName ?? null,
      },
      results: input.results.map((r) => ({
        name: r.name,
        folderPath: r.folderPath,
        method: r.method,
        iteration: r.iteration,
        status: r.status,
        httpStatus: r.httpStatus ?? null,
        durationMs: r.durationMs ?? null,
        errorMessage: r.errorMessage ?? null,
        skipReason: r.skipReason ?? null,
        requestUrl: r.requestUrl ?? null,
        tests: r.tests.map((t) => ({
          name: t.name,
          status: t.status,
          durationMs: t.durationMs,
          error: t.error?.message ?? null,
        })),
      })),
    },
    null,
    2,
  );
}

export function buildJUnitReport(input: RunnerReportInput): string {
  const summary = counts(input.results);
  const durationSec = ((input.finishedAt - input.startedAt) / 1000).toFixed(3);
  const cases = input.results
    .map((r) => {
      const name = escapeXml(
        r.folderPath ? `${r.folderPath}/${r.name}` : r.name,
      );
      const time = ((r.durationMs ?? 0) / 1000).toFixed(3);
      if (r.status === "failed") {
        const message = escapeXml(r.errorMessage ?? "failed");
        return `    <testcase classname="${escapeXml(input.config.collectionName)}" name="${name}" time="${time}">\n      <failure message="${message}"/>\n    </testcase>`;
      }
      if (r.status === "skipped") {
        return `    <testcase classname="${escapeXml(input.config.collectionName)}" name="${name}" time="${time}">\n      <skipped/>\n    </testcase>`;
      }
      return `    <testcase classname="${escapeXml(input.config.collectionName)}" name="${name}" time="${time}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${escapeXml(input.config.collectionName)}" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${durationSec}">
${cases}
  </testsuite>
</testsuites>
`;
}

export function buildHtmlReport(input: RunnerReportInput): string {
  const summary = counts(input.results);
  const rows = input.results
    .map((r) => {
      const path = r.folderPath ? `${r.folderPath}/${r.name}` : r.name;
      return `<tr>
        <td>${r.method}</td>
        <td>${escapeXml(path)}</td>
        <td>${r.status}</td>
        <td>${r.httpStatus ?? "—"}</td>
        <td>${r.durationMs ?? "—"}</td>
        <td>${escapeXml(r.errorMessage ?? "")}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Fishman Runner — ${escapeXml(input.config.collectionName)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.25rem; }
    .meta { color: #555; margin-bottom: 1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; font-size: 0.875rem; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${escapeXml(input.config.collectionName)} — Collection Run</h1>
  <div class="meta">
    Environment: ${escapeXml(input.environmentName ?? "—")}<br/>
    Started: ${new Date(input.startedAt).toISOString()}<br/>
    Finished: ${new Date(input.finishedAt).toISOString()}<br/>
    Passed: ${summary.passed} · Failed: ${summary.failed} · Skipped: ${summary.skipped} · Total: ${summary.total}
  </div>
  <table>
    <thead>
      <tr><th>Method</th><th>Request</th><th>Status</th><th>HTTP</th><th>ms</th><th>Error</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
}
