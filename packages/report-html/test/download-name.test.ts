import { describe, expect, it } from "vitest";
import { reportDownloadDisposition, reportDownloadName } from "../src/index.js";

const run_id = "b574a8b2-c981-4346-9a27-79f6e86ae947";

describe("downloaded report file name (owner's request, 2026-11-06)", () => {
  it("is Load Calculation Report - customer - address", () => {
    expect(reportDownloadName({ customer_name: "Jane Smith", address: "10938 Middle Knoll Dr, Dallas, TX 75238", run_id })).toBe(
      "Load Calculation Report - Jane Smith - 10938 Middle Knoll Dr, Dallas, TX 75238.pdf",
    );
  });

  it("drops characters phones and desktops refuse in a file name", () => {
    const name = reportDownloadName({ customer_name: 'Lee / "Bo" O\'Neil', address: "12 Oak St: Unit 4|B?\n Plano, TX", run_id });
    expect(name).toBe("Load Calculation Report - Lee Bo O'Neil - 12 Oak St Unit 4 B Plano, TX.pdf");
    expect(name).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/u);
  });

  it("leaves out a missing part, and uses the short run id when both are missing", () => {
    expect(reportDownloadName({ customer_name: "Jane Smith", address: null, run_id })).toBe("Load Calculation Report - Jane Smith.pdf");
    expect(reportDownloadName({ customer_name: "  ", address: "1 Elm St, Dallas, TX", run_id })).toBe("Load Calculation Report - 1 Elm St, Dallas, TX.pdf");
    expect(reportDownloadName({ customer_name: null, address: undefined, run_id })).toBe("Load Calculation Report - run b574a8b2.pdf");
  });

  it("stays short enough for any file system", () => {
    const name = reportDownloadName({ customer_name: "A".repeat(200), address: "B".repeat(200), run_id });
    expect(name.length).toBeLessThanOrEqual(124);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("sends the name in both header forms, accents kept in the UTF-8 one", () => {
    const h = reportDownloadDisposition({ customer_name: "José Núñez", address: "5 Main St (rear), Irving, TX", run_id });
    expect(h).toBe(
      `attachment; filename="Load Calculation Report - Jose Nunez - 5 Main St (rear), Irving, TX.pdf"; filename*=UTF-8''Load%20Calculation%20Report%20-%20Jos%C3%A9%20N%C3%BA%C3%B1ez%20-%205%20Main%20St%20%28rear%29%2C%20Irving%2C%20TX.pdf`,
    );
    expect(decodeURIComponent(h.split("UTF-8''")[1]!)).toBe("Load Calculation Report - José Núñez - 5 Main St (rear), Irving, TX.pdf");
  });
});
