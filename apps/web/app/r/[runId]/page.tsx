import type { ReportModel } from "@rhoeflow/report";
import { REPORT_CSS, reportBodyHtml } from "@rhoeflow/report-html";
import { isStoreError } from "@rhoeflow/store";
import { loadReportModel } from "../../../lib/report";
import { requirePageContext } from "../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * The report for one frozen run (WO-03 E1). The markup and stylesheet come from
 * `@rhoeflow/report-html`, the same ones the PDF prints (E2, ADR-037), so screen and paper show the
 * same numbers in the same design. The model comes only from the frozen run (`loadReportModel`).
 */
export default async function ReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  await requirePageContext(`/r/${encodeURIComponent(runId)}`);
  let model: ReportModel;
  try {
    model = await loadReportModel(runId);
  } catch (e) {
    const message = isStoreError(e)
      ? e.message
      : e instanceof Error && e.name === "ZodError"
        ? `"${runId}" is not a run id.`
        : "Something went wrong rendering this report.";
    return (
      <main className="wrap">
        <h1>RhoeFlow Pro</h1>
        <div className="issue error" role="alert">
          {message}
        </div>
        <p className="muted">Run {runId}</p>
      </main>
    );
  }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      <nav className="report-actions" aria-label="Report">
        {model.meta.stale ? (
          <span className="note">Run the assessment again to download a PDF of this report.</span>
        ) : (
          <a href={`/r/${encodeURIComponent(model.meta.run_id)}/pdf`} download>
            Download PDF
          </a>
        )}
      </nav>
      <div dangerouslySetInnerHTML={{ __html: reportBodyHtml(model) }} />
    </>
  );
}
