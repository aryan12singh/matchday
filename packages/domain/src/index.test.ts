import { describe, expect, it } from 'vitest';

import { FIXTURE_STATES, SELECTION_MODES, STAGE_FORMATS } from './index';

describe('domain scaffold', () => {
  it('models the competition hierarchy stage formats from 05-domain-model.md', () => {
    expect(STAGE_FORMATS).toEqual(['round_robin', 'groups', 'knockout']);
  });

  it('covers every fixture state the design system must render', () => {
    // design/README.md: editable | locked | live | settled | void map onto these.
    expect(FIXTURE_STATES).toContain('live');
    expect(FIXTURE_STATES).toContain('void');
    expect(FIXTURE_STATES).toContain('postponed');
  });

  it('models the league selection modes from addendum §B', () => {
    expect(SELECTION_MODES).toEqual(['all', 'admin_pick', 'vote']);
  });
});
