export const metadata = {
  title: 'Privacy',
  description: 'What MatchDay stores about you, and why.',
};

/**
 * Privacy notice.
 *
 * Deliberately specific about what is actually stored, because the honest list is short
 * and a vague one invites the assumption that it is long. Every item below corresponds to
 * a real table in the schema.
 */
export default function PrivacyPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[32px] font-bold tracking-tight text-text">Privacy</h1>
        <p className="pt-1 text-[13px] text-text-3">Last updated 31 July 2026</p>
      </header>

      <Section title="What we store">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong className="text-text">Your email and password.</strong> Handled by
            Supabase Auth. We never see your password.
          </li>
          <li>
            <strong className="text-text">A username and optional avatar.</strong> Visible
            to other members of leagues you join.
          </li>
          <li>
            <strong className="text-text">Your predictions,</strong> and a revision history
            of them. The history exists so a league can see that nothing was changed after
            a deadline.
          </li>
          <li>
            <strong className="text-text">Your league memberships</strong> and scores.
          </li>
          <li>
            <strong className="text-text">Notification preferences,</strong> and — if you
            turn push on — a subscription token per device. That token identifies a browser
            to its push service; it is not a location or a device fingerprint.
          </li>
        </ul>
      </Section>

      <Section title="What we do not do">
        <p>
          No advertising, no third-party analytics, no selling or sharing your data with
          anyone. There are no tracking cookies — the only cookie is the one that keeps you
          signed in.
        </p>
      </Section>

      <Section title="Who can see your predictions">
        <p>
          Members of a league can see each other&rsquo;s predictions for a match once it
          has kicked off, or earlier if the organizer has set the league that way. Before
          that they are yours alone, and the rule is enforced by the database rather than
          by the interface.
        </p>
        <p>People outside your leagues cannot see your predictions at all.</p>
      </Section>

      <Section title="Who processes it">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong className="text-text">Supabase</strong> — database, authentication and
            storage.
          </li>
          <li>
            <strong className="text-text">Vercel</strong> — hosting.
          </li>
          <li>
            <strong className="text-text">Football data providers</strong> — we read
            fixtures and results from them. They receive nothing about you.
          </li>
          <li>
            <strong className="text-text">Your browser&rsquo;s push service</strong> —
            Apple, Google or Mozilla, depending on your device, and only if you enable
            notifications.
          </li>
        </ul>
      </Section>

      <Section title="Deleting your account">
        <p>
          Delete your account from your profile page. Your email address, username, avatar,
          league memberships, notification preferences, push subscriptions and calendar
          feed are all destroyed, and the account can never sign in again.
        </p>
        <p>
          One thing survives, anonymously: the points you scored in matchweeks other
          people&rsquo;s leagues have already completed. Those stay attached to an opaque
          identifier with no name and no contact details, because deleting them would
          silently change results and standings other members have already seen — and in a
          league playing for money, already settled up on.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Ask your league organizer, or write to the address the app was shared from, for
          anything about your data.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-[18px] font-bold tracking-tight text-text">{title}</h2>
      <div className="flex flex-col gap-2 text-[14.5px] leading-relaxed text-text-2">
        {children}
      </div>
    </section>
  );
}
