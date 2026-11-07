import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR, OPERATOR_ADDRESS } from "../../lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · RhoeFlow Pro",
  description: "What the RhoeFlow Pro app and its Android app collect, why, who processes it, and how to have it deleted.",
};

/**
 * The app's privacy policy (ADR-046): public, no sign-in, the URL given to Google Play. Covers the app
 * at app.rhoeflow.pro and the Android app that opens it; the marketing site has its own policy.
 * Lists only what the app does today (no analytics, no ads, no location or camera permission).
 */
export default function PrivacyPage() {
  return (
    <main className="wrap legal">
      <h1>Privacy policy</h1>
      <p className="fine">Last updated {LEGAL_UPDATED}</p>
      <p>
        This policy covers the RhoeFlow Pro app at app.rhoeflow.pro and the RhoeFlow Android app, which opens the same app. Both are run by {OPERATOR} (&ldquo;we&rdquo;). RhoeFlow is a tool for HVAC contractors to do load calculations and equipment and duct design for the houses they work on.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your email address, the name and phone number you add to your profile, your password (stored only as a secure hash by our sign-in provider), the company account you belong to and your role in it.
        </li>
        <li>
          <strong>Your work.</strong> Jobs, customer names and house addresses, the answers and measurements you enter, photos and notes you attach, templates, calculation runs and reports.
        </li>
        <li>
          <strong>House information looked up from an address.</strong> When you pick an address we look up its map position, a satellite picture of the property, and public property and permit records (for example year built and size).
        </li>
        <li>
          <strong>Connections you set up.</strong> If your company connects WorkEdge, the connection key (stored encrypted) and the WorkEdge jobs you open in RhoeFlow.
        </li>
        <li>
          <strong>Technical data.</strong> Our hosting provider records standard request data such as IP address, browser or device type and the pages requested, to keep the service running and secure.
        </li>
      </ul>
      <p>
        The Android app asks for no location, contacts, microphone or storage permission. The compass on the &ldquo;Which way the front faces&rdquo; question is read on your phone and only the direction you choose is saved. We do not use advertising or analytics trackers, and we do not sell your information.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To sign you in, run the app for your company account and show your work to the people in that account.</li>
        <li>To fill in house details, do the calculations and produce the reports you ask for.</li>
        <li>To send the emails the app needs, such as sign-in codes, password resets and invites.</li>
        <li>To keep the service working, fix problems and protect it from abuse.</li>
      </ul>

      <h2>Who processes it for us</h2>
      <p>These providers handle data only to run RhoeFlow for us:</p>
      <ul>
        <li>Supabase: sign-in, database and file storage.</li>
        <li>Cloudflare: hosting and printing report PDFs.</li>
        <li>Resend: sending the app&rsquo;s emails.</li>
        <li>OpenRouteService: turning an address into a map position.</li>
        <li>Esri (ArcGIS) and the U.S. Geological Survey: satellite pictures.</li>
        <li>RentCast and public county and city records: property facts and permits.</li>
        <li>WorkEdge: only if your company connects it, to read and attach to WorkEdge jobs.</li>
      </ul>
      <p>The address you look up is sent to the address, imagery and property providers. Your name and email are not.</p>

      <h2>Who can see your work</h2>
      <p>Work saved in RhoeFlow belongs to the company account it was saved in. The people in that account can see it, and its admins manage who is in it. Reports you share or send leave RhoeFlow with whoever you send them to.</p>

      <h2>How long we keep it</h2>
      <p>We keep your account and your company&rsquo;s work while the account is in use. When you ask us to delete your account we do so within 30 days, and copies in our providers&rsquo; backups are removed as those backups expire.</p>

      <h2>Deleting your account and your rights</h2>
      <p>
        You can ask us what we hold about you, ask us to correct it, or have your account deleted. See <Link href="/delete-account">Delete your account</Link>, or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Children</h2>
      <p>RhoeFlow is a business tool for adults and is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date at the top of this page.</p>

      <h2>Contact</h2>
      <p>
        {OPERATOR} · {OPERATOR_ADDRESS} · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}
