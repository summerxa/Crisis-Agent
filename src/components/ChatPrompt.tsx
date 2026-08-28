import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type ChatPromptProps = {
  onPress: () => void;
};

export default function ChatPrompt({ onPress }: ChatPromptProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>💬</Text>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>Have more questions?</Text>
        <Text style={styles.subtitle}>Ask the assistant →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 20,

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#FFFFFF',

    paddingVertical: 12,
    paddingHorizontal: 14,

    borderRadius: 16,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 6,

    elevation: 20,

    zIndex: 999,
  },

  pressed: {
    opacity: 0.8,
  },

  iconContainer: {
    marginRight: 10,
  },

  icon: {
    fontSize: 20,
  },

  textContainer: {
    flexDirection: 'column',
  },

  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },

  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
});