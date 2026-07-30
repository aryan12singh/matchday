export const metadata = {
  title: 'Terms',
  description: 'The terms for using MatchDay.',
};

/**
 * Terms of use.
 *
 * Written for a private prediction league among friends, which is what MatchDay is. The
 * two points that actually matter — no money moves through the app, and football data
 * comes from third parties and can be wrong — are stated plainly rather than buried,
 * because they are the two things a user could otherwise be surprised by.
 *
 * Not legal advice, and not a substitute for a lawyer if this ever takes payments.
 */
export default function TermsPage() {
  return (
    <article className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-[32px] font-bold tracking-tight text-text">Terms</h1>
        <p className="pt-1 text-[13px] text-text-3">Last updated 31 July 2026</p>
      </header>

      <Section title="What MatchDay is">
        <p>
          MatchDay is a prediction game for private leagues among people who know each
          other. You predict football results, your league scores them, and a leaderboard
          says who is winning. That is the whole product.
        </p>
      </Section>

      <Section title="MatchDay never handles money">
        <p>
          Some leagues attach amounts to finishing positions. MatchDay records those
          amounts and shows you a ledger. It does not take payments, hold funds, transfer
          anything, or act as a stakeholder. Settling up is entirely between you and the
          people in your league, and any dispute about it is between you and them.
        </p>
        <p>
          MatchDay is not a gambling service and is not licensed as one. Do not use it as
          one. If your league is playing for money, that is a private arrangement you are
          responsible for keeping lawful where you live.
        </p>
      </Section>

      <Section title="Football data comes from third parties">
        <p>
          Fixtures, results, squads and match events come from external providers. They are
          usually right and occasionally not: a result can be corrected hours later, a
          goal can be reassigned to a different scorer, a kick-off can move.
        </p>
        <p>
          When that happens MatchDay re-scores the affected matches automatically and
          records the change, which means your points and your position can move after you
          first see them. We show corrections rather than hiding them. We cannot promise
          the data is accurate, and we are not liable for decisions you make based on it.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your password to yourself and do not let someone else predict as you — a
          league only works if everyone is answering for themselves. Tell your organizer if
          you think somebody else has used your account.
        </p>
        <p>
          You can delete your account at any time from your profile. Your email address,
          name, avatar and league memberships are destroyed, and the account can never sign
          in again. What remains is an anonymous placeholder holding the points you scored
          in other people&rsquo;s completed matchweeks — removing those would change
          results and standings your league has already seen, and possibly settled up on.
        </p>
      </Section>

      <Section title="Predictions lock at kick-off">
        <p>
          Every prediction has a deadline, and the deadline is enforced by the database
          rather than the screen. Once a match kicks off its prediction cannot be created
          or changed, by anyone, including league organizers and us.
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Do not attempt to break the game for other people: no automated scraping of other
          users&rsquo; predictions, no attempts to write past a lock, no abuse of other
          members. Organizers can remove members from their league. We can suspend accounts
          that do these things.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          MatchDay is provided as it is. We do not guarantee it will be available, that
          scoring will always be correct, or that data will never be wrong. To the extent
          the law allows, we are not liable for losses arising from using it — including
          any amounts your league agreed between yourselves.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms may change as the app does. Material changes will be noted on this
          page with a new date at the top.
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
