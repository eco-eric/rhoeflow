/** Signs this browser out (a plain form post, so it works before any script loads). */
export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  return (
    <form method="post" action="/auth/sign-out">
      <button className="secondary" type="submit">{label}</button>
    </form>
  );
}
