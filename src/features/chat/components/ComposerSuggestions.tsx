import { Image as ExpoImage } from 'expo-image';
import { Brain } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { CapabilityMentionCandidate } from '@/features/chat/capability-mentions';
import type { SkillMentionCandidate } from '@/features/chat/skill-mentions';
import { useLogoFallback } from '@/hooks/use-logo-fallback';
import { logoFallbackUrls } from '@/services/links/provider-brand';
import type { Palette } from '@/ui/palette';
import type { ComposerSlashCommand } from '@/features/chat/hooks/use-composer-controller';
import { composerStyles as styles } from './composer-styles';

export function ComposerSuggestions(props: {
  colors: Palette;
  mentionCandidates: CapabilityMentionCandidate[];
  skillCandidates: SkillMentionCandidate[];
  slashCommands: ComposerSlashCommand[];
  onMentionCandidateSelect: (candidate: CapabilityMentionCandidate) => void;
  onSkillCandidateSelect: (candidate: SkillMentionCandidate) => void;
  onSelectSlashCommand: (command: ComposerSlashCommand) => void;
}) {
  const { t } = useTranslation();
  const { colors, mentionCandidates, skillCandidates, slashCommands } = props;
  if (!mentionCandidates.length && !skillCandidates.length && !slashCommands.length) return null;

  return (
    <View style={[styles.slashPalette, { borderColor: colors.border, backgroundColor: colors.card }]}> 
      {mentionCandidates.length ? (
        <>
          <Text style={[styles.mentionPaletteLabel, { color: colors.subtle }]}>{t('thread.composer.mentions.label')}</Text>
          <SuggestionScroll>
            {mentionCandidates.map((candidate) => {
              const item = candidate.kind === 'cli' ? candidate.app : candidate.preset;
              return (
                <Pressable
                  accessibilityLabel={t(candidate.kind === 'cli' ? 'thread.composer.mentions.cliDescription' : 'thread.composer.mentions.mcpDescription', { name: candidate.name })}
                  key={`${candidate.kind}-${candidate.name}`}
                  onPress={() => props.onMentionCandidateSelect(candidate)}
                  style={({ pressed }) => [styles.slashCommandRow, pressed && { backgroundColor: colors.pressed }]}
                >
                  <MentionCandidateLogo candidate={candidate} colors={colors} />
                  <View style={styles.slashCommandBody}>
                    <View style={styles.slashCommandTitleRow}>
                      <Text numberOfLines={1} style={[styles.slashCommandName, { color: colors.foreground }]}>{item.display_name}</Text>
                      <Text numberOfLines={1} style={[styles.slashCommandHint, { color: colors.subtle }]}>@{candidate.name}</Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>
                      {candidate.kind === 'cli' ? t('thread.composer.mentions.cliGroup') : t('thread.composer.mentions.mcpGroup')}
                    </Text>
                  </View>
                  <MentionBadge color={candidate.kind === 'cli' ? '#D65B08' : '#087DA4'} backgroundColor={candidate.kind === 'cli' ? '#F9731618' : '#0EA5E918'}>
                    {candidate.kind === 'cli' ? 'CLI' : 'MCP'}
                  </MentionBadge>
                </Pressable>
              );
            })}
          </SuggestionScroll>
        </>
      ) : skillCandidates.length ? (
        <SuggestionScroll>
          {skillCandidates.map((candidate) => (
            <Pressable
              accessibilityLabel={t('settings.skills.openDetails', { name: candidate.skill.name })}
              key={candidate.command}
              onPress={() => props.onSkillCandidateSelect(candidate)}
              style={({ pressed }) => [styles.slashCommandRow, pressed && { backgroundColor: colors.pressed }]}
            >
              <View style={[styles.slashCommandIcon, { backgroundColor: colors.pressed }]}>
                <Brain color={colors.muted} size={17} strokeWidth={1.8} />
              </View>
              <View style={styles.slashCommandBody}>
                <Text style={[styles.slashCommandName, { color: colors.foreground }]}>{candidate.skill.name}</Text>
                <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>
                  {candidate.skill.description || candidate.skill.name}
                </Text>
              </View>
              {candidate.recent ? <MentionBadge color={colors.muted} backgroundColor={colors.pressed}>{t('thread.composer.slash.badges.recent')}</MentionBadge> : null}
            </Pressable>
          ))}
        </SuggestionScroll>
      ) : (
        <SuggestionScroll>
          {slashCommands.map((command) => (
            <Pressable
              accessibilityLabel={`${t('thread.composer.slash.ariaLabel')}: ${command.command}`}
              key={command.command}
              onPress={() => props.onSelectSlashCommand(command)}
              style={({ pressed }) => [styles.slashCommandRow, pressed && { backgroundColor: colors.pressed }]}
            >
              <View style={[styles.slashCommandIcon, { backgroundColor: colors.pressed }]}>
                <Text style={[styles.slashCommandIconText, { color: colors.muted }]}>/</Text>
              </View>
              <View style={styles.slashCommandBody}>
                <View style={styles.slashCommandTitleRow}>
                  <Text style={[styles.slashCommandName, { color: colors.foreground }]}>{command.command}</Text>
                  {command.argHint ? <Text numberOfLines={1} style={[styles.slashCommandHint, { color: colors.subtle }]}>{command.argHint}</Text> : null}
                </View>
                <Text numberOfLines={1} style={[styles.slashCommandDescription, { color: colors.muted }]}>{command.description || command.title}</Text>
              </View>
              {command.recent ? <MentionBadge color={colors.muted} backgroundColor={colors.pressed}>{t('thread.composer.slash.badges.recent')}</MentionBadge> : null}
            </Pressable>
          ))}
        </SuggestionScroll>
      )}
    </View>
  );
}

function SuggestionScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.slashPaletteScroll}>
      {children}
    </ScrollView>
  );
}

function MentionBadge({ children, color, backgroundColor }: { children: React.ReactNode; color: string; backgroundColor: string }) {
  return (
    <View style={[styles.mentionKindBadge, { backgroundColor }]}> 
      <Text style={[styles.mentionKindText, { color }]}>{children}</Text>
    </View>
  );
}

export function MentionCandidateLogo({ candidate, colors }: { candidate: CapabilityMentionCandidate; colors: Palette }) {
  const item = candidate.kind === 'cli' ? candidate.app : candidate.preset;
  const rawLogoUrl = item.logo_url?.trim() || null;
  const logoUrls = useMemo(() => logoFallbackUrls(rawLogoUrl), [rawLogoUrl]);
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(logoUrls);
  const initials = (item.display_name || item.name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || item.name.slice(0, 2).toUpperCase();

  if (logoUrl) {
    return (
      <ExpoImage
        accessibilityLabel={item.display_name || item.name}
        contentFit="contain"
        onError={onLogoError}
        onLoad={onLogoLoad}
        source={{ uri: logoUrl }}
        style={styles.mentionLogo}
        transition={0}
      />
    );
  }
  return (
    <View style={[styles.mentionLogoFallback, { backgroundColor: item.brand_color || colors.pressed }]}> 
      <Text style={[styles.mentionLogoText, { color: item.brand_color ? '#FFFFFF' : colors.foreground }]}>{initials}</Text>
    </View>
  );
}
