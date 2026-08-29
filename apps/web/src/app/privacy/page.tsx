const LAST_UPDATED = "August 28, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated {LAST_UPDATED}</p>
      </div>

      <p>
        Meadow is a personal finance tracking application built and used by its developer for
        their own budgeting and net-worth tracking. It is not currently offered as a public
        product or service to other individuals. This policy describes what data Meadow collects
        and how it&apos;s handled.
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold">What data is collected</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="font-medium">Sign-in:</span> name, email address, and profile picture
            from Google, via Google Sign-In.
          </li>
          <li>
            <span className="font-medium">Bank data:</span> account and transaction data from
            financial institutions you explicitly connect via Plaid Link, after you consent
            through Plaid&apos;s own authorization screen. Meadow only requests Plaid&apos;s
            Transactions product — no ability to move money, view credentials, or initiate
            payments.
          </li>
          <li>
            <span className="font-medium">Manually entered data:</span> any accounts, transactions,
            budgets, or categories you enter directly, or import via CSV.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">How data is used</h2>
        <p>
          Solely to power Meadow&apos;s own features for the account holder — categorizing
          transactions, computing budgets and net worth, and detecting recurring charges. Data is
          never sold, and never shared with any third party beyond what&apos;s required to provide
          the service itself (Plaid, for bank connections; Google, for sign-in).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Storage and security</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Data is stored in a Postgres database, scoped per account by user id.</li>
          <li>All network traffic (sign-in, bank connections, the app itself) is encrypted in transit via TLS.</li>
          <li>
            Plaid access tokens — the credential that grants ongoing access to a connected
            bank — are encrypted at rest (AES-256-GCM) before being stored, not kept in plain
            text.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Data retention and deletion</h2>
        <p>
          You can permanently delete your account and everything in it — connected banks,
          accounts, transactions, budgets, and categories — at any time from the Settings page.
          Deleting your account also revokes Meadow&apos;s access to any bank connected via
          Plaid (Plaid&apos;s <code>/item/remove</code>), not just Meadow&apos;s local copy of the
          data.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Contact</h2>
        <p>
          Questions about this policy or your data can be sent to the developer at{" "}
          <a className="underline" href="mailto:wuscdaniel@gmail.com">
            wuscdaniel@gmail.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
