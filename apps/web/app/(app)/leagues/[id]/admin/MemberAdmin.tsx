'use client';

import { changeMemberRole, removeMember } from './actions';

/**
 * Member management.
 *
 * Removing someone is a real action with real consequences — their predictions stay
 * settled and their history stays in the league feed — so the button says what it does
 * and sits behind a confirm.
 */
export function MemberAdmin({
  leagueId,
  members,
  viewerId,
}: {
  leagueId: string;
  members: Array<{ userId: string; username: string; role: string }>;
  viewerId: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label">Members</h2>
      <ul className="flex flex-col divide-y divide-border">
        {members.map((member) => {
          const isSelf = member.userId === viewerId;

          return (
            <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-[11px] font-bold uppercase"
              >
                {member.username.slice(0, 2)}
              </span>
              <span className="flex-1 truncate text-[14px]">
                {member.username}
                {isSelf ? <span className="ml-2 label text-text-3">You</span> : null}
              </span>

              <form action={changeMemberRole} className="flex items-center gap-2">
                <input type="hidden" name="leagueId" value={leagueId} />
                <input type="hidden" name="userId" value={member.userId} />
                <label className="sr-only" htmlFor={`role-${member.userId}`}>
                  Role for {member.username}
                </label>
                <select
                  id={`role-${member.userId}`}
                  name="role"
                  defaultValue={member.role}
                  className="min-h-tap rounded-md bg-surface-2 px-3 text-[13px] shadow-el-1"
                >
                  <option value="member">Member</option>
                  <option value="organizer">Organizer</option>
                </select>
                <button
                  type="submit"
                  className="min-h-tap px-2 font-display text-[11px] font-bold uppercase tracking-label text-text-3 hover:text-text"
                >
                  Set
                </button>
              </form>

              {!isSelf ? (
                <form
                  action={removeMember}
                  onSubmit={(event) => {
                    if (
                      !window.confirm(
                        `Remove ${member.username}? Their settled points stay in the league's history.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="leagueId" value={leagueId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <button
                    type="submit"
                    className="min-h-tap px-2 font-display text-[11px] font-bold uppercase tracking-label text-danger hover:opacity-80"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-text-3">
        The last organizer cannot be demoted or leave — a league with nobody to administer
        it cannot finalise fixtures or settle anything.
      </p>
    </section>
  );
}
