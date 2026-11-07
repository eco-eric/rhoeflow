"use client";
import { useEffect, useState } from "react";
import { deletionMailto } from "../../lib/legal";

/** Opens the person's email app with the deletion request written, their sign-in address filled in when signed in. */
export function DeletionRequestButton() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { user?: { email?: string } }) : null))
      .then((me) => {
        if (live && me?.user?.email) setEmail(me.user.email);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <p>
      <a className="secondary" href={deletionMailto(email)}>
        Email a deletion request
      </a>
      {email ? <span className="fine"> for {email}</span> : null}
    </p>
  );
}
