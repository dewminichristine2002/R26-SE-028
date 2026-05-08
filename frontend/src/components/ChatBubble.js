import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const ChatBubble = ({
  role,
  content,
  sql,
  rows,
  fallback,
  onSpeak,
  isSpeaking = false,
}) => {
  const [showSource, setShowSource] = useState(false);
  const isAssistant = role === 'assistant' || role === 'system';
  const hasSource = isAssistant && (sql || (Array.isArray(rows) && rows.length > 0));

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

            {hasSource ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showSource ? 'Hide details' : 'Show where this answer came from'}
                onPress={() => setShowSource((prev) => !prev)}
                style={({ pressed }) => [
                  styles.metaButton,
                  pressed && styles.metaButtonPressed,
                ]}
              >
                <Text style={styles.metaButtonIcon}>{'\u{1F50D}'}</Text>
                <Text style={styles.metaButtonText}>
                  {showSource ? 'Hide details' : 'Where this came from'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showSource && hasSource ? (
          <View style={styles.sourceBox}>
            {sql ? (
              <>
                <Text style={styles.sourceTitle}>Question we asked your records</Text>
                <Text style={styles.sourceCode}>{sql}</Text>
              </>
            ) : null}
            {Array.isArray(rows) && rows.length > 0 ? (
              <>
                <Text style={styles.sourceTitle}>
                  Records found ({rows.length}{rows.length > 5 ? ', showing first 5' : ''})
                </Text>
                <Text style={styles.sourceCode}>
                  {JSON.stringify(rows.slice(0, 5), null, 2)}
                </Text>
              </>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  avatarText: { fontSize: 18 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 17,
    lineHeight: 26,
  },
  textUser: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
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
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  metaButtonIcon: { fontSize: 14, marginRight: 6 },
  metaButtonText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '700',
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
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 12,
  },
  sourceTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 4,
  },
  sourceCode: {
    color: '#E5E7EB',
    fontSize: 12,
    fontFamily: 'Courier',
    lineHeight: 18,
  },
});

export default ChatBubble;
