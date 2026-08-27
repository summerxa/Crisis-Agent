import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import type { AppTab } from '../types';

export default function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const tabs: { key: AppTab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'map', label: 'Map', icon: '📍' },
    { key: 'chat', label: 'Ask', icon: '✨' },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map(tab => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={styles.navItem}>
            <Text style={[styles.navIcon, active && styles.navActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navLabel, active && styles.navActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
