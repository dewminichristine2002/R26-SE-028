import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const ChatBubble = ({
  role,
  content,
  sql,
  rows,
  sources,
  safetyNote,
  fallback,
  onSpeak,
  isSpeaking = false,
}) => {
  const isAssistant = role === 'assistant' || role === 'system';
  const sourceList = Array.isArray(sources) && sources.length
    ? sources
    : (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        name: row.name || row.source_name || row.sourceName,
        url: row.url || row.source_url || row.sourceUrl,
      }))
      .filter((source) => source.name || source.url);

  return (
    <View style={[styles.row, isAssistant ? styles.rowLeft : styles.rowRight]}>
      {isAssistant ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{'\u{1F49A}'}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.bubble,
          isAssistant ? styles.bubbleAssistant : styles.bubbleUser,
          fallback && styles.bubbleFallback,
        ]}
      >
        <Text style={isAssistant ? styles.textAssistant : styles.textUser}>
          {String(content || '').trim() || '\u2026'}
        </Text>

        {isAssistant && sourceList.length > 0 ? (
          <View style={styles.sourceBox}>
            <Text style={styles.sourceTitle}>Trusted sources</Text>
            {sourceList.slice(0, 4).map((source, index) => (
              <Text key={`${source.name || source.url}-${index}`} style={styles.sourceText}>
                {source.name || source.url}
              </Text>
            ))}
          </View>
        ) : null}

        {isAssistant && safetyNote ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{safetyNote}</Text>
          </View>
        ) : null}

        {isAssistant ? (
          <View style={styles.metaRow}>
            {onSpeak ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSpeaking ? 'Stop reading aloud' : 'Read this answer aloud'}
                onPress={onSpeak}
                style={({ pressed }) => [
                  styles.metaButton,
                  styles.listenButton,
                  isSpeaking && styles.listenButtonActive,
                  pressed && styles.metaButtonPressed,
                ]}
              >
                <Text style={styles.metaButtonIcon}>
                  {isSpeaking ? '\u23F8\uFE0F' : '\u{1F50A}'}
                </Text>
                <Text style={[styles.metaButtonText, styles.listenButtonText]}>
                  {isSpeaking ? 'Stop' : 'Listen'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  avatarText: { fontSize: 22 },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
  },
  bubbleAssistant: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bubbleUser: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 6,
  },
  bubbleFallback: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  textAssistant: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 28,
  },
  textUser: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  metaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    marginRight: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metaButtonPressed: {
    backgroundColor: '#E5E7EB',
  },
  metaButtonIcon: { fontSize: 17, marginRight: 6 },
  metaButtonText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '900',
  },
  listenButton: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  listenButtonActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  listenButtonText: {
    color: '#166534',
  },
  sourceBox: {
    marginTop: 12,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  sourceTitle: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  sourceText: {
    color: '#14532D',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 3,
  },
  noteBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  noteText: {
    color: '#1E3A8A',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
});

export default ChatBubble;
