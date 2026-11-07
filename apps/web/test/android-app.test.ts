import { describe, expect, it } from "vitest";
import { appLinkTarget } from "../lib/app-link";
import { ANDROID_PACKAGE, assetLinks, parseFingerprints } from "../lib/assetlinks";
import { fileNameFrom, safeFileName } from "../lib/download-file-name";
import { CONTACT_EMAIL, deletionMailto } from "../lib/legal";

// ADR-046: the Android app's App Links, PDF save, and the deletion request.

const ORIGIN = "https://app.rhoeflow.pro";
const FP_A = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
const FP_B = Array.from({ length: 32 }, () => "AB").join(":");

describe("appLinkTarget", () => {
  it("follows a sign-in link to this site", () => {
    const link = `${ORIGIN}/auth/callback?token_hash=abc&type=magiclink&next=%2F`;
    expect(appLinkTarget(link, ORIGIN, `${ORIGIN}/`, null)).toBe(link);
  });
  it("follows each link once, so a used sign-in link is not opened again", () => {
    const link = `${ORIGIN}/auth/callback?code=xyz`;
    expect(appLinkTarget(link, ORIGIN, `${ORIGIN}/`, link)).toBeNull();
  });
  it("ignores other sites, plain http and nonsense", () => {
    expect(appLinkTarget("https://rhoeflow.pro/pricing", ORIGIN, `${ORIGIN}/`, null)).toBeNull();
    expect(appLinkTarget("https://app.rhoeflow.pro.evil.example/x", ORIGIN, `${ORIGIN}/`, null)).toBeNull();
    expect(appLinkTarget("http://app.rhoeflow.pro/auth/callback", ORIGIN, `${ORIGIN}/`, null)).toBeNull();
    expect(appLinkTarget("javascript:alert(1)", ORIGIN, `${ORIGIN}/`, null)).toBeNull();
    expect(appLinkTarget("not a url", ORIGIN, `${ORIGIN}/`, null)).toBeNull();
    expect(appLinkTarget(undefined, ORIGIN, `${ORIGIN}/`, null)).toBeNull();
  });
  it("does nothing when the page is already there", () => {
    expect(appLinkTarget(`${ORIGIN}/`, ORIGIN, `${ORIGIN}/`, null)).toBeNull();
  });
});

describe("assetlinks.json", () => {
  it("keeps only SHA-256 fingerprints, upper-cased and without repeats", () => {
    expect(parseFingerprints(` ${FP_A.toLowerCase()}, ${FP_B}\n${FP_A} junk AA:BB `)).toEqual([FP_A, FP_B]);
    expect(parseFingerprints("")).toEqual([]);
    expect(parseFingerprints(undefined)).toEqual([]);
  });
  it("names the Android package and its certificates", () => {
    expect(assetLinks([FP_A])).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [FP_A] },
      },
    ]);
    expect(ANDROID_PACKAGE).toBe("pro.rhoeflow.app");
  });
  it("is empty until a fingerprint is set", () => {
    expect(assetLinks([])).toEqual([]);
  });
});

describe("PDF file name in the Android app", () => {
  it("reads the UTF-8 name the PDF route sends", () => {
    const d = `attachment; filename="Load Calculation Report - Jose Alvarez - 12 Elm St.pdf"; filename*=UTF-8''${encodeURIComponent("Load Calculation Report - José Álvarez - 12 Elm St.pdf")}`;
    expect(fileNameFrom(d, "x.pdf")).toBe("Load Calculation Report - José Álvarez - 12 Elm St.pdf");
  });
  it("falls back to the plain name, then to the fallback", () => {
    expect(fileNameFrom('attachment; filename="Report.pdf"', "x.pdf")).toBe("Report.pdf");
    expect(fileNameFrom(null, "Load Calculation Report.pdf")).toBe("Load Calculation Report.pdf");
  });
  it("never lets a name reach outside the cache folder", () => {
    expect(fileNameFrom(`attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd`, "x.pdf")).not.toContain("/");
    expect(safeFileName("a/b\\c:d")).toBe("a b c d");
    expect(safeFileName("   ")).toBe("RhoeFlow report.pdf");
  });
  it("shortens a long name but keeps .pdf", () => {
    const long = safeFileName(`${"Very long address ".repeat(20)}.pdf`);
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("deletion request email", () => {
  it("goes to the RhoeFlow inbox with the sign-in address filled in", () => {
    const m = deletionMailto("tech@example.com");
    expect(m.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(m)).toContain("Sign-in email: tech@example.com");
    expect(decodeURIComponent(deletionMailto(null))).toContain("(the address I sign in with)");
  });
});
