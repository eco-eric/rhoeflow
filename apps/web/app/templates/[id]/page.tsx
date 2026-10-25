import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

/** Template editor (WO-03 D9): /templates/<id>, or /templates/new[?from=<id>] to create or copy. */
export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  return (
    <main className="wrap wide-wrap">
      <TemplateEditor id={decodeURIComponent(id)} from={from ?? null} />
    </main>
  );
}
