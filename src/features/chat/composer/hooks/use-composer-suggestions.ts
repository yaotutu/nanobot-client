import { useCallback, useEffect, useMemo } from 'react';

import {
  capabilityMentionCandidates,
  capabilityMentionQuery,
  insertCapabilityMention,
  type CapabilityMentionCandidate,
} from '@/features/chat/composer/model/capability-mentions';
import {
  insertSkillMention,
  skillMentionCandidates,
  skillMentionQuery,
  type SkillMentionCandidate,
} from '@/features/chat/composer/model/skill-mentions';
import { slashQuery } from '@/features/chat/composer/model/slash-command';
import {
  selectComposerRecents,
  selectComposerRecentsHydrated,
  useComposerRecentsStore,
} from '@/stores/composer-recents-store';
import type { CliAppInfo, McpPresetInfo, SkillSummary } from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat';

import type { ComposerSlashCommand } from '../model/types';

interface UseComposerSuggestionsOptions {
  cliApps: CliAppInfo[];
  clearDraft: () => void;
  cursor: number;
  focusAt: (cursor: number) => void;
  handleStop: () => void;
  mcpPresets: McpPresetInfo[];
  mentionMenuDismissed: boolean;
  setCursor: (cursor: number) => void;
  setMentionMenuDismissed: (dismissed: boolean) => void;
  setSlashMenuDismissed: (dismissed: boolean) => void;
  setText: (text: string) => void;
  skills: SkillSummary[];
  slashCommands: SlashCommand[];
  slashMenuDismissed: boolean;
  text: string;
  turnActive: boolean;
}

export function useComposerSuggestions(options: UseComposerSuggestionsOptions) {
  const {
    cliApps,
    clearDraft,
    cursor,
    focusAt,
    handleStop,
    mcpPresets,
    mentionMenuDismissed,
    setCursor,
    setMentionMenuDismissed,
    setSlashMenuDismissed,
    setText,
    skills,
    slashCommands,
    slashMenuDismissed,
    text,
    turnActive,
  } = options;
  const recentCommands = useComposerRecentsStore(selectComposerRecents);
  const recentsHydrated = useComposerRecentsStore(selectComposerRecentsHydrated);
  const hydrateRecents = useComposerRecentsStore((state) => state.hydrate);
  const recordRecentCommand = useComposerRecentsStore((state) => state.record);

  useEffect(() => {
    if (!recentsHydrated) void hydrateRecents();
  }, [hydrateRecents, recentsHydrated]);

  const currentSlashQuery = slashMenuDismissed ? null : slashQuery(text);
  const visibleSlashCommands = useMemo(() => {
    if (currentSlashQuery === null) return [];
    const query = currentSlashQuery.trim().toLowerCase();
    return slashCommands
      .filter((command) => {
        if (!query && command.command === '/restart') return false;
        if (!query && !turnActive && command.command === '/stop') return false;
        if (!query) return true;
        return [command.command, command.title, command.description, command.argHint]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (turnActive) {
          if (left.command === '/stop') return -1;
          if (right.command === '/stop') return 1;
        }
        if (query) return 0;
        const leftRecent = recentCommands.indexOf(left.command);
        const rightRecent = recentCommands.indexOf(right.command);
        if (leftRecent === -1 && rightRecent === -1) return 0;
        if (leftRecent === -1) return 1;
        if (rightRecent === -1) return -1;
        return leftRecent - rightRecent;
      })
      .slice(0, 8)
      .map((command): ComposerSlashCommand => ({
        ...command,
        recent: recentCommands.includes(command.command),
      }));
  }, [currentSlashQuery, recentCommands, slashCommands, turnActive]);

  const currentSkillQuery = slashMenuDismissed ? null : skillMentionQuery(text, cursor);
  const visibleSkillCandidates = useMemo(
    () => skillMentionCandidates(currentSkillQuery, skills, recentCommands),
    [currentSkillQuery, recentCommands, skills],
  );
  const currentMentionQuery = mentionMenuDismissed
    ? null
    : capabilityMentionQuery(text, cursor);
  const visibleMentionCandidates = useMemo(
    () => capabilityMentionCandidates(currentMentionQuery, cliApps, mcpPresets),
    [cliApps, currentMentionQuery, mcpPresets],
  );

  const selectSlashCommand = useCallback((command: ComposerSlashCommand) => {
    if (command.command === '/stop' && turnActive) {
      handleStop();
      clearDraft();
      setSlashMenuDismissed(true);
      return;
    }
    recordRecentCommand(command.command);
    const nextValue = command.acceptsArgs ? `${command.command} ` : command.command;
    setText(nextValue);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    setCursor(nextValue.length);
    focusAt(nextValue.length);
  }, [
    clearDraft,
    focusAt,
    handleStop,
    recordRecentCommand,
    setCursor,
    setMentionMenuDismissed,
    setSlashMenuDismissed,
    setText,
    turnActive,
  ]);

  const selectSkillCandidate = useCallback((candidate: SkillMentionCandidate) => {
    if (!currentSkillQuery) return;
    recordRecentCommand(candidate.command);
    const next = insertSkillMention(text, currentSkillQuery, candidate);
    setText(next.value);
    setCursor(next.cursor);
    setSlashMenuDismissed(true);
    setMentionMenuDismissed(false);
    focusAt(next.cursor);
  }, [
    currentSkillQuery,
    focusAt,
    recordRecentCommand,
    setCursor,
    setMentionMenuDismissed,
    setSlashMenuDismissed,
    setText,
    text,
  ]);

  const selectMentionCandidate = useCallback((candidate: CapabilityMentionCandidate) => {
    if (!currentMentionQuery) return;
    const next = insertCapabilityMention(text, currentMentionQuery, candidate);
    setText(next.value);
    setCursor(next.cursor);
    setMentionMenuDismissed(true);
    setSlashMenuDismissed(false);
    focusAt(next.cursor);
  }, [
    currentMentionQuery,
    focusAt,
    setCursor,
    setMentionMenuDismissed,
    setSlashMenuDismissed,
    setText,
    text,
  ]);

  return {
    selectMentionCandidate,
    selectSkillCandidate,
    selectSlashCommand,
    visibleMentionCandidates,
    visibleSkillCandidates,
    visibleSlashCommands,
  };
}
