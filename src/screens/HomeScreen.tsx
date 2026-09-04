import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS, REFRESH_STEPS } from '../constants';
import { styles } from '../styles';
import type { AppTab, CrisisDataState, CrisisFeature, HomePhase, LayerKey, StatusLevel } from '../types';
import CrisisMap from '../components/CrisisMap';
import ChatPrompt from '../components/ChatPrompt';
import { ActionItem, ChangeItem, Divider, InfoBlock, SectionLabel, SourceTag, StatusBadge } from '../components/common';

const defaultLayers: Record<LayerKey, boolean> = {
  myLocation: true,
  weatherAlerts: true,
  wildfires: true,
  evacWarning: false,
  evacOrder: false,
};

function locationLabel(data: CrisisDataState) {
  const location = data.snapshot?.location;
  return location
    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : data.locationError ?? 'Getting your location';
}

function syncLabel(data: CrisisDataState) {
  if (data.loading) return 'Refreshing official sources';
  if (!data.snapshot) return 'No live data available';
  return `${data.snapshot.stale ? 'Last available data' : 'Updated'} ${new Date(data.snapshot.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

const featureKindLabels: Record<CrisisFeature['kind'], string> = {
  weatherAlert: 'Weather alert',
  wildfire: 'Wildfire',
  evacWarning: 'Evacuation warning',
  evacOrder: 'Evacuation order',
};

const featureKindPriority: Record<CrisisFeature['kind'], number> = {
  evacOrder: 0,
  evacWarning: 1,
  wildfire: 2,
  weatherAlert: 3,
};

function formatTimestamp(value?: string) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function sourceHealthSummary(data: CrisisDataState) {
  const health = data.snapshot?.sourceHealth;
  if (!health) return 'Source status unavailable';

  const sourceLabels = Object.entries(health).map(([name, source]) =>
    `${name.toUpperCase()}: ${source.status}`,
  );
  return sourceLabels.join(' · ');
}

function uniqueFeatureSources(features: CrisisFeature[]) {
  return Array.from(new Set(features.map(feature => feature.sourceName).filter(Boolean)));
}

function getPrimaryFeature(features: CrisisFeature[]) {
  return [...features].sort((a, b) => {
    const priority = featureKindPriority[a.kind] - featureKindPriority[b.kind];
    if (priority !== 0) return priority;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0] ?? null;
}

function statusFromFeatures(features: CrisisFeature[]): StatusLevel {
  if (features.some(feature => feature.kind === 'evacOrder')) return 'ACT';
  if (features.some(feature => feature.kind === 'evacWarning' || feature.kind === 'wildfire')) return 'PREPARE';
  if (features.some(feature => feature.kind === 'weatherAlert')) return 'AWARE';
  return 'CLEAR';
}

function officialStatusBody(primaryFeature: CrisisFeature | null) {
  if (!primaryFeature) return 'No mapped official threats found for this location';

  const label = featureKindLabels[primaryFeature.kind];
  return `${label}: ${primaryFeature.title}`;
}

function crisisDescription(data: CrisisDataState, features: CrisisFeature[]) {
  const agentData = data.todoListAgent.data;
  if (agentData?.description) return agentData.description;
  if (data.todoListAgent.loading) return 'Generating a personalized crisis summary from official source data.';
  if (data.todoListAgent.error) return data.todoListAgent.error;
  if (features.length) return `${features.length} official map feature${features.length === 1 ? '' : 's'} found near your location.`;
  if (data.snapshot?.stale) return 'Live sources are partially unavailable. Missing data is not treated as an all-clear.';
  return 'Official sources returned no mapped threats for your location.';
}

function changeItems(data: CrisisDataState) {
  const agentChanges = data.todoListAgent.data?.change_items.filter(Boolean);
  if (agentChanges?.length) return agentChanges;

  const previousCount = data.previousSnapshot?.features.length ?? 0;
  const currentCount = data.snapshot?.features.length ?? 0;
  if (data.loading) return ['Refreshing official sources'];
  if (!data.previousSnapshot) return ['No previous refresh available for comparison'];
  if (currentCount === previousCount) return ['Official feature count is unchanged since the last refresh'];
  return [`Official feature count changed from ${previousCount} to ${currentCount}`];
}

function sourceRows(data: CrisisDataState) {
  const features = data.snapshot?.features ?? [];
  if (features.length) {
    return features.slice(0, 6).map(feature => ({
      name: `${feature.sourceName} - ${feature.title}`,
      time: formatTimestamp(feature.updatedAt),
    }));
  }

  return Object.entries(data.snapshot?.sourceHealth ?? {}).map(([name, health]) => ({
    name: `${name.toUpperCase()} source ${health.status}`,
    time: formatTimestamp(health.checkedAt),
  })).concat(data.snapshot ? [] : [{ name: 'No source data available', time: 'Refresh needed' }]);
}

export default function HomeScreen({
  phase,
  setPhase,
  onNavigate,
  crisisData,
}: {
  phase: HomePhase;
  setPhase: (phase: HomePhase) => void;
  onNavigate: (tab: AppTab) => void;
  crisisData: CrisisDataState;
}) {
  if (phase === 'refreshing') {
    return <RefreshingContent refresh={crisisData.refresh} onComplete={() => setPhase('no-crisis')} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <CrisisContent
          onNavigate={onNavigate}
          onRefresh={() => setPhase('refreshing')}
          crisisData={crisisData}
        />
      </ScrollView>

      <ChatPrompt onPress={() => onNavigate('chat')} />
    </View>
  );
}

function Header({
  sync,
  onRefresh,
  location,
}: {
  sync: string;
  onRefresh: () => void;
  location: string;
}) {
  return (
    <View style={styles.header}>
      <View>
        <View style={styles.rowCenter}>
          <Text style={styles.locationIcon}>⌖</Text>
          <Text style={styles.locationText}>{location}</Text>
        </View>
        <Text style={styles.subtleText}>{sync}</Text>
      </View>
      <Pressable onPress={onRefresh} style={styles.refreshButton}>
        <Text style={styles.refreshText}>↻ Refresh</Text>
      </Pressable>
    </View>
  );
}

function CrisisContent({
  onNavigate,
  onRefresh,
  crisisData,
}: {
  onNavigate: (tab: AppTab) => void;
  onRefresh: () => void;
  crisisData: CrisisDataState;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const snapshot = crisisData.snapshot;
  const features = snapshot?.features ?? [];
  const agentData = crisisData.todoListAgent.data;
  const primaryFeature = getPrimaryFeature(features);
  const statusLevel = agentData?.state ?? statusFromFeatures(features);
  const sources = uniqueFeatureSources(features);
  const actions = agentData?.action_items.filter(item => item.short_description) ?? [];
  const changes = changeItems(crisisData);
  const sourceAttribution = sources.length
    ? `Source${sources.length === 1 ? '' : 's'}: ${sources.join(', ')}`
    : sourceHealthSummary(crisisData);
  const planBody = agentData?.subtitle
    ?? (crisisData.todoListAgent.loading ? 'Generating action plan' : 'No generated action plan available');

  return (
    <View>
      <Header
        sync={syncLabel(crisisData)}
        onRefresh={onRefresh}
        location={locationLabel(crisisData)}
      />

      <CrisisMap compact layers={defaultLayers} location={crisisData.snapshot?.location ?? null} features={crisisData.snapshot?.features ?? []} loading={crisisData.loading} stale={crisisData.snapshot?.stale} onExpandMap={() => onNavigate('map')} />

      <View style={styles.card}>
        <View style={styles.cardPadded}>
          <StatusBadge level={statusLevel} />
          <Text style={styles.bodyText}>{crisisDescription(crisisData, features)}</Text>
        </View>
        <Divider />
        <InfoBlock
          accent={COLORS.navy}
          title="Official Status"
          body={officialStatusBody(primaryFeature)}
          caption={sourceAttribution}
        />
        <Divider />
        <InfoBlock
          accent="#6366F1"
          title="Suggested action plan"
          body={planBody}
          caption={crisisData.todoListAgent.error ?? 'Generated by your crisis agent · Not official guidance'}
        />
        <View style={styles.primaryFeatureStrip}>
          <View>
            <Text style={styles.primaryFeatureTitle}>{primaryFeature?.title ?? 'No mapped threats'}</Text>
            <Text style={styles.subtleText}>{primaryFeature ? `${featureKindLabels[primaryFeature.kind]} · ${primaryFeature.status}` : 'Official source data'}</Text>
          </View>
          <View>
            <Text style={styles.distanceText}>{features.length} feature{features.length === 1 ? '' : 's'}</Text>
            <Text style={styles.subtleText}>{primaryFeature ? formatTimestamp(primaryFeature.updatedAt) : syncLabel(crisisData)}</Text>
          </View>
        </View>
      </View>

      <SectionLabel>What to do now</SectionLabel>
      <View style={styles.card}>
        {actions.length ? actions.map((item, index) => (
          <ActionItem
            key={`${item.short_description}-${index}`}
            text={item.short_description}
            detail={item.long_description}
            icon={item.emoji}
            citation={item.citation}
            index={index}
          />
        )) : (
          <ActionItem
            text={crisisData.todoListAgent.loading ? 'Generating recommended actions' : 'Refresh to generate recommended actions'}
            index={0}
          />
        )}
      </View>

      <SectionLabel>Since your last refresh</SectionLabel>
      <View style={styles.card}>
        {changes.map(text => (
          <ChangeItem key={text} text={text} />
        ))}
      </View>

      <Pressable
        onPress={() => setSourcesOpen(open => !open)}
        style={[styles.card, styles.sourcesButton]}>
        <Text style={styles.sourceButtonText}>ⓘ Sources & attribution</Text>
        <Text style={styles.chevron}>{sourcesOpen ? '⌃' : '⌄'}</Text>
      </Pressable>
      {sourcesOpen && (
        <View style={[styles.card, styles.sourcesList]}>
          {sourceRows(crisisData).map(source => (
            <SourceTag key={`${source.name}-${source.time}`} name={source.name} time={source.time} />
          ))}
        </View>
      )}
    </View>
  );
}

function RefreshingContent({ onComplete, refresh }: { onComplete: () => void; refresh: () => Promise<void> }) {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timings = [400, 900, 1500, 2100, 2700];
    const timers = timings.map((delay, index) =>
      setTimeout(() => {
        setVisibleSteps(index + 1);
        setCurrentStep(index);
      }, delay),
    );
    let cancelled = false;
    const started = Date.now();
    refresh().finally(() => {
      const remaining = Math.max(0, 1000 - (Date.now() - started));
      setTimeout(() => { if (!cancelled) onComplete(); }, remaining);
    });

    return () => {
      timers.forEach(clearTimeout);
      cancelled = true;
    };
  }, [onComplete, refresh]);

  return (
    <View style={styles.refreshingScreen}>
      <View style={styles.refreshLocation}>
        <Text style={styles.locationIcon}>⌖</Text>
        <Text style={styles.locationText}>San Jose, CA</Text>
      </View>
      <View style={styles.bigSpinner}>
        <ActivityIndicator color={COLORS.navy} size="large" />
      </View>
      <Text style={styles.refreshTitle}>Checking your area</Text>
      <Text style={styles.refreshCaption}>
        Your crisis agent is consulting official sources
      </Text>

      <View style={styles.steps}>
        {REFRESH_STEPS.slice(0, visibleSteps).map((step, index) => {
          const done = index < currentStep;
          const active = index === currentStep;

          return (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDone,
                  active && styles.stepActive,
                ]}>
                {done && <Text style={styles.stepCheck}>✓</Text>}
              </View>
              <Text style={[styles.stepText, active && styles.stepTextActive]}>
                {step}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
