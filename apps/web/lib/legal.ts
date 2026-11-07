/**
 * Who runs RhoeFlow and how to reach them, for the privacy and account-deletion pages Google Play asks
 * for (ADR-046). Same company details and inbox as the marketing site (eco-eric/rhoeflow-site:
 * src/pages/privacy.astro; info@rhoeflow.com is routed to the owner).
 */
export const OPERATOR = "EcoSource IQ";
export const OPERATOR_ADDRESS = "808 Business Pkwy, Richardson, TX 75081";
export const CONTACT_EMAIL = "info@rhoeflow.com";
export const DELETE_SUBJECT = "Delete my RhoeFlow account";
export const LEGAL_UPDATED = "November 6, 2026";

/** A mailto link for a deletion request, prefilled with the address the person signs in with when known. */
export function deletionMailto(email: string | null | undefined): string {
  const lines = [
    "Please delete my RhoeFlow account.",
    "",
    `Sign-in email: ${email ?? "(the address I sign in with)"}`,
    "",
    "I understand this removes my sign-in and profile, and that work saved in a company account stays with that company unless I am its only member.",
  ];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(DELETE_SUBJECT)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
