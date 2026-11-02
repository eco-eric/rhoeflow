import { describe, expect, it } from "vitest";
import { projectIdFrom } from "../lib/project-id";

describe("projectIdFrom (opening a job by its WorkEdge link)", () => {
  const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c0d9e8f7a6b";

  it("takes the project id out of a pasted WorkEdge link", () => {
    expect(projectIdFrom(`https://app.workedgepro.com/projects/${ID}?tab=photos`)).toBe(ID);
    expect(projectIdFrom(`  ${ID.toUpperCase()}  `)).toBe(ID);
  });

  it("accepts a plain id and refuses anything else", () => {
    expect(projectIdFrom("we_project_dev_1")).toBe("we_project_dev_1");
    expect(projectIdFrom("")).toBeNull();
    expect(projectIdFrom(null)).toBeNull();
    expect(projectIdFrom("the Smith house")).toBeNull();
    expect(projectIdFrom("../settings")).toBeNull();
  });
});
