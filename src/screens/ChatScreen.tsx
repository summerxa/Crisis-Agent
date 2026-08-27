import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { COLORS, DEFAULT_RESPONSE, SCRIPTED_RESPONSES, SUGGESTED_PROMPTS } from '../constants';
import { styles } from '../styles';
import type { ChatMessage } from '../types';

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant' as const,
      text: "I'm your crisis assistant for the Canyon Fire situation near San Jose. I can answer questions about your evacuation status, what to do, or what changed since your last update.",
      source: 'Grounded in: CAL FIRE, Santa Clara County OES, NWS Bay Area',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const idRef = useRef(1);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) {
      return;
    }

    setMessages(prev => [
      ...prev,
      { id: idRef.current++, role: 'user' as const, text: trimmed },
    ]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = SCRIPTED_RESPONSES[trimmed] ?? DEFAULT_RESPONSE;
      setMessages(prev => [
        ...prev,
        {
          id: idRef.current++,
          role: 'assistant' as const,
          text: response.text,
          source: response.source,
        },
      ]);
      setIsTyping(false);
    }, 1100);
  };

  return (
    <View style={styles.chatScreen}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Ask about this crisis</Text>
        <Text style={styles.onlineText}>● Canyon Fire · San Jose, CA</Text>
      </View>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.map(message => (
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
              {message.role === 'assistant' && message.source && (
                <Text style={styles.messageSource}>ⓘ {message.source}</Text>
              )}
            </View>
          </View>
        ))}
        {isTyping && (
          <View style={styles.typingRow}>
            <View style={styles.assistantAvatar}>
              <Text style={styles.avatarText}>i</Text>
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator color={COLORS.muted} />
            </View>
          </View>
        )}
      </ScrollView>

      {messages.length <= 1 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionTitle}>Suggested questions</Text>
          <View style={styles.promptWrap}>
            {SUGGESTED_PROMPTS.map(prompt => (
              <Pressable
                key={prompt}
                onPress={() => sendMessage(prompt)}
                style={styles.promptChip}>
                <Text style={styles.promptText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          placeholder="Ask about the Canyon Fire..."
          placeholderTextColor="#C0BDB7"
          style={styles.input}
        />
        <Pressable
          disabled={!input.trim() || isTyping}
          onPress={() => sendMessage(input)}
          style={[
            styles.sendButton,
            !!input.trim() && !isTyping && styles.sendButtonReady,
          ]}>
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}
