import { TemplatesList } from "./templates-list";

export const dynamic = "force-dynamic";

/** Template list (WO-03 D9). Desktop first. */
export default function TemplatesPage() {
  return (
    <main className="wrap wide-wrap">
      <h1>Era templates</h1>
      <p className="muted">Every default the quick pass uses comes from one of these. Each edit makes a new version; nothing is changed in place.</p>
      <TemplatesList />
    </main>
  );
}
