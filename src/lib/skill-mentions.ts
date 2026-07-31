import type { SkillSummary } from '@/types/nanobot';

export interface SkillMentionQuery {
  query: string;
  start: number;
  end: number;
}

export interface SkillMentionCandidate {
  command: string;
  recent: boolean;
  skill: SkillSummary;
}

export function skillMentionQuery(
  value: string,
  cursorPosition: number,
): SkillMentionQuery | null {
  const caret = Math.min(Math.max(cursorPosition, 0), value.length);
  const beforeCaret = value.slice(0, caret);
  const match = /\$([a-z0-9_-]*)$/i.exec(beforeCaret);
  if (!match) return null;
  return {
    query: match[1].toLowerCase(),
    start: match.index,
    end: caret,
  };
}

function skillMatchRank(skill: SkillSummary, query: string): number | null {
  if (!query) return 0;
  const name = skill.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (skill.description.toLowerCase().includes(query)) return 3;
  return null;
}

export function skillMentionCandidates(
  query: SkillMentionQuery | null,
  skills: SkillSummary[],
  recentCommands: string[],
): SkillMentionCandidate[] {
  if (!query) return [];
  return skills
    .filter((skill) => skill.available)
    .flatMap((skill, sourceIndex) => {
      const matchRank = skillMatchRank(skill, query.query);
      return matchRank === null
        ? []
        : [{
            command: `$${skill.name}`,
            matchRank,
            sourceIndex,
            skill,
          }];
    })
    .sort((left, right) => {
      if (left.matchRank !== right.matchRank) return left.matchRank - right.matchRank;
      if (query.query) return left.sourceIndex - right.sourceIndex;
      const leftRecent = recentCommands.indexOf(left.command);
      const rightRecent = recentCommands.indexOf(right.command);
      if (leftRecent === -1 && rightRecent === -1) return left.sourceIndex - right.sourceIndex;
      if (leftRecent === -1) return 1;
      if (rightRecent === -1) return -1;
      return leftRecent - rightRecent;
    })
    .slice(0, 8)
    .map(({ command, skill }) => ({
      command,
      recent: recentCommands.includes(command),
      skill,
    }));
}

export function insertSkillMention(
  value: string,
  query: SkillMentionQuery,
  candidate: SkillMentionCandidate,
): { value: string; cursor: number } {
  const suffix = value.slice(query.end);
  const inserted = `${candidate.command}${suffix.startsWith(' ') ? '' : ' '}`;
  return {
    value: `${value.slice(0, query.start)}${inserted}${suffix}`,
    cursor: query.start + inserted.length,
  };
}
