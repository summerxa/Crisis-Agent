import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import type { AppTab } from '../types';
import { HomeIcon, MapIcon, ChatIcon } from './svg';

export default function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const tabs = [
    { key: 'home' as AppTab, label: 'Home', icon: HomeIcon },
    { key: 'map' as AppTab, label: 'Map', icon: MapIcon },
    { key: 'chat' as AppTab, label: 'Ask', icon: ChatIcon },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map(tab => {
        const active = tab.key === activeTab;
        const Icon = tab.icon;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={styles.navItem}>
            <Icon
              active={active}
            />
            <Text style={[styles.navLabel, active && styles.navActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
