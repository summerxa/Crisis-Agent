import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS } from '../constants';
import { styles } from '../styles';
import type { SessionChatState } from '../types';

export default function ChatScreen({ chat }: { chat: SessionChatState }) {
  return (
    <View style={styles.chatScreen}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Ask about this crisis</Text>
        <Text style={styles.onlineText}>● {chat.statusText}</Text>
      </View>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {chat.messages.map(message => (
          <View
            key={message.id}
            style={[
              styles.messageRow,
              message.role === 'user' && styles.messageRowUser,
            ]}>
            {message.role === 'assistant' && (
              <View style={styles.assistantAvatar}>
                <Text style={styles.avatarText}>i</Text>
              </View>
            )}
            <View
              style={[
                styles.messageBubble,
                message.role === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble,
              ]}>
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' && styles.userMessageText,
                ]}>
                {message.text}
              </Text>
              {message.role === 'assistant' && !!message.citations?.length && (
                <Text style={styles.messageSource}>ⓘ {message.citations.join(', ')}</Text>
              )}
            </View>
          </View>
        ))}
        {chat.isSubmitting && (
          <View style={styles.typingRow}>
            <View style={styles.assistantAvatar}>
              <Text style={styles.avatarText}>i</Text>
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator color={COLORS.muted} />
            </View>
          </View>
        )}
        {chat.hydrated && !chat.chatReady && (
          <View style={styles.typingRow}>
            <View style={styles.assistantAvatar}>
              <Text style={styles.avatarText}>i</Text>
            </View>
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <Text style={styles.messageText}>{chat.contextMessage}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {!!chat.followUpPrompts.length && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionTitle}>Suggested questions</Text>
          <View style={styles.promptWrap}>
            {chat.followUpPrompts.map(prompt => (
              <Pressable
                key={prompt}
                disabled={chat.disabled}
                onPress={() => chat.sendMessage(prompt)}
                style={[
                  styles.promptChip,
                  chat.disabled && styles.promptChipDisabled,
                ]}>
                <Text style={styles.promptText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          value={chat.input}
          onChangeText={chat.setInput}
          onSubmitEditing={() => chat.sendMessage(chat.input)}
          editable={!chat.disabled}
          placeholder={chat.inputPlaceholder}
          placeholderTextColor="#C0BDB7"
          style={styles.input}
        />
        <Pressable
          disabled={!chat.input.trim() || chat.disabled}
          onPress={() => chat.sendMessage(chat.input)}
          style={[
            styles.sendButton,
            !!chat.input.trim() && !chat.disabled && styles.sendButtonReady,
          ]}>
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}
