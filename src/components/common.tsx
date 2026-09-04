import React from 'react';
import { Text, View } from 'react-native';
import { STATUS_CONFIG } from '../constants';
import { styles } from '../styles';
import type { StatusLevel } from '../types';

export function StatusBadge({ level }: { level: StatusLevel }) {
  const config = STATUS_CONFIG[level];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: config.text }]} />
      <Text style={[styles.badgeText, { color: config.text }]}>{level}</Text>
    </View>
  );
}

export function InfoBlock({
  accent,
  title,
  body,
  caption,
}: {
  accent: string;
  title: string;
  body: string;
  caption: string;
}) {
  return (
    <View style={styles.infoBlock}>
      <Text style={[styles.infoTitle, { color: accent }]}>■ {title}</Text>
      <Text style={styles.infoBody}>{body}</Text>
      <Text style={styles.subtleText}>{caption}</Text>
    </View>
  );
}

export function ActionItem({
  text,
  index,
  detail,
  icon,
  citation,
}: {
  text: string;
  index: number;
  detail?: string;
  icon?: string;
  citation?: string[];
}) {
  const fallbackIcons = ['⚠️', '📍', '📡', 'ⓘ'];
  const citationText = citation?.filter(Boolean).join(' · ');
  return (
    <View style={styles.actionItem}>
      <View style={styles.actionIcon}>
        <Text style={styles.actionIconText}>{icon ?? fallbackIcons[index] ?? 'ⓘ'}</Text>
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionText}>{text}</Text>
        {!!detail && <Text style={styles.actionDetail}>{detail}</Text>}
        {!!citationText && <Text style={styles.actionCitation}>Source: {citationText}</Text>}
      </View>
    </View>
  );
}

export function ChangeItem({ text }: { text: string }) {
  return (
    <View style={styles.changeItem}>
      <View style={styles.changeDot} />
      <Text style={styles.changeText}>{text}</Text>
    </View>
  );
}

export function SourceTag({ name, time }: { name: string; time: string }) {
  return (
    <View style={styles.sourceTag}>
      <Text style={styles.sourceName}>ⓘ {name}</Text>
      <Text style={styles.subtleText}>{time}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}
