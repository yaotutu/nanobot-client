import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSkills } from '@/features/skills/api';
import { useSkillsStore } from '@/features/skills/store';
import type { SkillSummary } from '@/types/api/capabilities';

vi.mock('@/features/skills/api', () => ({
  fetchSkills: vi.fn(),
}));

const skill: SkillSummary = {
  name: 'writer',
  description: 'Write documents',
  source: 'builtin',
  available: true,
};

describe('useSkillsStore', () => {
  beforeEach(() => {
    vi.mocked(fetchSkills).mockReset();
    useSkillsStore.getState().resetAll();
  });

  it('owns the canonical skills catalog', async () => {
    vi.mocked(fetchSkills).mockResolvedValue({ skills: [skill] });

    await useSkillsStore.getState().refresh();

    expect(useSkillsStore.getState()).toMatchObject({
      skills: [skill],
      payload: { skills: [skill] },
      loaded: true,
      loading: false,
      refreshing: false,
      error: null,
    });
  });

  it('preserves the last catalog when refresh fails', async () => {
    useSkillsStore.getState().applyPayload({ skills: [skill] });
    vi.mocked(fetchSkills).mockRejectedValue(new Error('skills unavailable'));

    await useSkillsStore.getState().refresh();

    expect(useSkillsStore.getState()).toMatchObject({
      skills: [skill],
      loaded: true,
      error: 'skills unavailable',
      loading: false,
      refreshing: false,
    });
  });

  it('ignores a stale refresh after reset without clearing the new in-flight request', async () => {
    const oldSkill = { ...skill, name: 'old' };
    const newSkill = { ...skill, name: 'new' };
    let resolveFirst!: (value: { skills: SkillSummary[] }) => void;
    let resolveSecond!: (value: { skills: SkillSummary[] }) => void;
    vi.mocked(fetchSkills)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveSecond = resolve;
      }));

    const first = useSkillsStore.getState().refresh();
    useSkillsStore.getState().resetAll();
    const second = useSkillsStore.getState().refresh();
    resolveFirst({ skills: [oldSkill] });
    await first;

    const overlapping = useSkillsStore.getState().refresh();
    expect(fetchSkills).toHaveBeenCalledTimes(2);

    resolveSecond({ skills: [newSkill] });
    await Promise.all([second, overlapping]);
    expect(useSkillsStore.getState().skills).toEqual([newSkill]);
  });

  it('deduplicates overlapping refreshes', async () => {
    let resolveRequest!: (value: { skills: SkillSummary[] }) => void;
    vi.mocked(fetchSkills).mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = useSkillsStore.getState().refresh();
    const second = useSkillsStore.getState().refresh();
    resolveRequest({ skills: [skill] });
    await Promise.all([first, second]);

    expect(fetchSkills).toHaveBeenCalledTimes(1);
  });
});
