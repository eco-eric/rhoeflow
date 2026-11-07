import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, DELETE_SUBJECT, OPERATOR } from "../../lib/legal";
import { DeletionRequestButton } from "./deletion-request-button";

export const metadata: Metadata = {
  title: "Delete your account · RhoeFlow Pro",
  description: "How to have your RhoeFlow account and its data deleted.",
};

/**
 * How to delete a RhoeFlow account (ADR-046): public, no sign-in, the account-deletion URL given to
 * Google Play, and the page Settings > Profile links to from inside the app. Deletion is by request to
 * the RhoeFlow inbox; the person's own sign-in address is filled in when they are signed in.
 */
export default function DeleteAccountPage() {
  return (
    <main className="wrap legal">
      <h1>Delete your RhoeFlow account</h1>
      <p>
        RhoeFlow Pro and the RhoeFlow Android app are run by {OPERATOR}. You can have your account and its data deleted at any time.
      </p>

      <h2>How to ask</h2>
      <ol>
        <li>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address you sign in with, with the subject &ldquo;{DELETE_SUBJECT}&rdquo;. The button below writes that email for you.
        </li>
        <li>We reply to confirm it is you, then delete the account within 30 days and tell you when it is done.</li>
      </ol>
      <DeletionRequestButton />

      <h2>What is deleted</h2>
      <ul>
        <li>Your sign-in, your profile (name, email and phone) and your place in any company account.</li>
        <li>
          If you are the only person in your company account: the company account too, with its jobs, answers, photos, templates, calculation runs, reports and its WorkEdge connection.
        </li>
      </ul>

      <h2>What is kept</h2>
      <ul>
        <li>
          If other people are still in your company account, the work saved there stays with the company, because it belongs to the company. Its admins can ask us to delete the whole company account the same way.
        </li>
        <li>Anything already sent to WorkEdge or emailed to a customer is held by them; delete it there.</li>
        <li>Copies in our providers&rsquo; backups are removed as those backups expire.</li>
      </ul>
      <p>
        More in the <Link href="/privacy">privacy policy</Link>.
      </p>
    </main>
  );
}
