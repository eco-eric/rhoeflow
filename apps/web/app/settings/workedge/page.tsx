import { redirect } from "next/navigation";

/** The WorkEdge tab became Connectors (ADR-040); old links still land there. */
export default function WorkEdgeSettingsMoved() {
  redirect("/settings/connectors#workedge");
}
