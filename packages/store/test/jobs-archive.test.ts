import { describe, expect, it } from "vitest";
import { createJob, findOrCreateJobForWorkEdge, getJob, jobSearchWords, listJobs, setJobArchived } from "../src/index.js";
import { ctxA, ctxB, makeDeps } from "./helpers.js";

async function seed() {
  const deps = makeDeps();
  const mk = async (customer_name: string, address_line1: string, city = "Dallas") => {
    const j = await createJob(deps, ctxA(), { customer_name, address_line1, city, state: "TX", postal_code: "75216" });
    deps.tick();
    return j;
  };
  const rivera = await mk("Pat Rivera", "1412 Elm St");
  const cedar = await mk("Lee Okafor", "1406 Cedar Oaks Boulevard");
  const plano = await mk("Sam Ortiz", "88 Preston Rd", "Plano");
  await createJob(deps, ctxB(), { customer_name: "Pat Rivera", address_line1: "1 Other St" });
  return { deps, rivera, cedar, plano };
}

describe("archiving and searching the account's load calcs (ADR-042)", () => {
  it("archives a job out of the active list and brings it back, never deleting it", async () => {
    const { deps, rivera, cedar, plano } = await seed();
    const archived = await setJobArchived(deps, ctxA(), cedar.job_id, true);
    expect(archived).toMatchObject({ job_id: cedar.job_id, archived_by: "we_user_eric" });
    expect(archived.archived_at).not.toBeNull();

    expect((await listJobs(deps, ctxA())).items.map((j) => j.job_id)).toEqual([plano.job_id, rivera.job_id]);
    expect((await listJobs(deps, ctxA(), { show: "archived" })).items.map((j) => j.job_id)).toEqual([cedar.job_id]);
    expect((await listJobs(deps, ctxA(), { show: "all" })).items).toHaveLength(3);
    // Still opens while archived.
    await expect(getJob(deps, ctxA(), cedar.job_id)).resolves.toMatchObject({ name: cedar.name });

    // Archiving twice keeps the first time and person.
    deps.tick();
    expect(await setJobArchived(deps, ctxA(), cedar.job_id, true)).toEqual(archived);

    const back = await setJobArchived(deps, ctxA(), cedar.job_id, false);
    expect(back).toMatchObject({ archived_at: null, archived_by: null });
    expect((await listJobs(deps, ctxA())).items).toHaveLength(3);
    expect((await listJobs(deps, ctxA(), { show: "archived" })).items).toHaveLength(0);
  });

  it("never archives another account's job", async () => {
    const { deps, rivera } = await seed();
    await expect(setJobArchived(deps, ctxB(), rivera.job_id, true)).rejects.toMatchObject({ code: "not_found" });
    expect((await getJob(deps, ctxA(), rivera.job_id)).archived_at).toBeNull();
  });

  it("finds jobs by any words of the name, customer or address, any case and order", async () => {
    const { deps, rivera, cedar, plano } = await seed();
    const find = async (q: string, show: "active" | "archived" | "all" = "active") => (await listJobs(deps, ctxA(), { q, show })).items.map((j) => j.job_id);
    expect(await find("rivera")).toEqual([rivera.job_id]);
    expect(await find("CEDAR 1406")).toEqual([cedar.job_id]);
    expect(await find("dallas")).toEqual([cedar.job_id, rivera.job_id]);
    expect(await find("plano, tx")).toEqual([plano.job_id]);
    expect(await find("75216")).toHaveLength(3);
    expect(await find("rivera plano")).toEqual([]);
    // Wildcards are text, not wildcards.
    expect(await find("%")).toHaveLength(3);
    expect(await find("riv_qq")).toEqual([]);
    // Search covers archived jobs when asked, and never another account's.
    await setJobArchived(deps, ctxA(), rivera.job_id, true);
    expect(await find("rivera")).toEqual([]);
    expect(await find("rivera", "archived")).toEqual([rivera.job_id]);
    expect(await find("rivera", "all")).toEqual([rivera.job_id]);
  });

  it("pages through search results", async () => {
    const { deps } = await seed();
    const p1 = await listJobs(deps, ctxA(), { q: "tx", limit: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await listJobs(deps, ctxA(), { q: "tx", limit: 2, before: p1.next_before });
    expect(p2.items).toHaveLength(1);
    expect(p2.next_before).toBeNull();
  });

  it("cleans what was typed into at most eight plain words", () => {
    expect(jobSearchWords("  Pat,  RIVERA ")).toEqual(["pat", "rivera"]);
    expect(jobSearchWords("50%_off*\\x")).toEqual(["50", "off", "x"]);
    expect(jobSearchWords("")).toEqual([]);
    expect(jobSearchWords("a b c d e f g h i j")).toHaveLength(8);
  });

  it("a WorkEdge job made here starts active", async () => {
    const deps = makeDeps();
    const { job } = await findOrCreateJobForWorkEdge(deps, ctxA(), { project_id: "we_project_9", property_id: null, name: "Rivera HVAC" });
    expect(job).toMatchObject({ archived_at: null, archived_by: null });
  });
});
