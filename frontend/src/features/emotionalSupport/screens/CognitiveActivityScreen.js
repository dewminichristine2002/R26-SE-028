import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { startAdaptiveActivity, submitAdaptiveActivity } from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import useEnglishVoice from '../voice/useEnglishVoice';
import { mapTranscriptToVisibleOption } from '../voice/voiceUtils';
import { activityStyles, colors, radius, screenInsets, shadows, spacing, type } from '../theme';
import { WellnessBackdrop } from '../components/WellnessUI';

const VOICE_TYPES = new Set(['word_category', 'odd_one_out', 'word_completion', 'short_memory_recall', 'orientation_activity', 'simple_math']);
const idOf = (value) => String(typeof value === 'string' ? value : value.id);
const labelOf = (value) => String(typeof value === 'string' ? value : value.label);
const typeOf = (attempt, activity) => attempt?.task?.activityType || String(activity?.activity_code || '').replace(/_(easy|medium)$/, '');
const formatDifficultyLabel = (value) => String(value || 'easy').toLowerCase() === 'medium' ? 'A Little More Challenge' : 'Gentle';
const isCorrectForItem = (item, response) => {
  if (!item) return false;
  if (item.kind === 'single_choice') return response?.selectedAnswer && String(response.selectedAnswer).toLowerCase() === String(item.correctAnswer || '').toLowerCase();
  if (item.kind === 'ordering') return Array.isArray(response?.orderedAnswers) && Array.isArray(item.correctOrder) && response.orderedAnswers.length === item.correctOrder.length && response.orderedAnswers.every((value, index) => String(value).toLowerCase() === String(item.correctOrder[index] || '').toLowerCase());
  if (item.kind === 'multi_recall') {
    const selected = new Set((response?.selectedAnswers || []).map((value) => String(value).toLowerCase()));
    const expectedChoices = Array.isArray(item['correct' + 'Answers']) ? item['correct' + 'Answers'] : [];
    const correct = new Set(expectedChoices.map((value) => String(value).toLowerCase()));
    return selected.size === correct.size && [...selected].every((value) => correct.has(value));
  }
  return false;
};

export default function CognitiveActivityScreen({ navigation, route }) {
  const activity = route?.params?.recommended_activity || {};
  const context = route?.params?.activity_context || {};
  const activitySource = route?.params?.activity_source || context.activity_source || 'recommended';
  const [attempt, setAttempt] = useState(null); const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState([]); const [ordered, setOrdered] = useState([]);
  const [responses, setResponses] = useState([]); const [studied, setStudied] = useState(false);
  const [result, setResult] = useState(null); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState(null); const [pendingResponse, setPendingResponse] = useState(null);
  const [voiceChoiceError, setVoiceChoiceError] = useState(''); const itemStarted = useRef(Date.now());
  const type = typeOf(attempt, activity); const look = activityStyles[type] || { symbol: 'ACT', accent: colors.primary, soft: colors.mint }; const { symbol: icon, accent, soft } = look;
  const items = attempt?.task?.items || (attempt?.task ? [{ ...attempt.task, id: 'legacy-item' }] : []);
  const item = items[index]; const total = attempt?.task?.totalItems || items.length;

  const onTranscript = useCallback((text) => {
    setTranscript(text); const match = mapTranscriptToVisibleOption(text, item?.options || []);
    if (!match) { setVoiceChoiceError('That did not exactly match a visible choice. Please try again or tap an answer.'); return; }
    setVoiceChoiceError(''); const id = idOf(match);
    setSelected((values) => item?.kind === 'multi_recall' ? (values.includes(id) ? values : [...values, id]) : [id]);
  }, [item]);
  const voice = useEnglishVoice({ onTranscript });

  async function start() {
    try { setLoading(true); setError(''); setAttempt(await startAdaptiveActivity({ ...context, activity_code: activity.activity_code })); itemStarted.current = Date.now(); }
    catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  function choose(option) { const id = idOf(option); setSelected((values) => item.kind === 'multi_recall' ? (values.includes(id) ? values.filter((value) => value !== id) : [...values, id]) : [id]); }
  function buildResponse() {
    return { itemId: item.id, responseTimeMs: Math.max(0, Date.now() - itemStarted.current), ...(item.kind === 'multi_recall' ? { selectedAnswers: selected } : item.kind === 'ordering' ? { orderedAnswers: ordered } : { selectedAnswer: selected[0] }) };
  }
  function resetRoundState() {
    setSelected([]); setOrdered([]); setStudied(false); setTranscript(''); setVoiceChoiceError(''); setFeedback(null); setPendingResponse(null); itemStarted.current = Date.now();
  }
  async function submitFinalRound(response) {
    try {
      voice.stopAll(); setLoading(true); setError(''); setResult(await submitAdaptiveActivity(attempt.attempt_id, { user_id: context.user_id, response: attempt.task.items ? { itemResponses: [...responses, response] } : response }));
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  async function next() {
    const response = buildResponse();
    const isCorrect = isCorrectForItem(item, response);
    const message = isCorrect ? "That's right." : "Nice try. Let's try another one.";
    if (index < items.length - 1) {
      setPendingResponse(response); setFeedback(message); return;
    }
    await submitFinalRound(response);
  }
  async function advanceAfterFeedback() {
    if (!pendingResponse) return;
    const all = [...responses, pendingResponse];
    if (index < items.length - 1) { voice.stopAll(); setResponses(all); setIndex(index + 1); resetRoundState(); return; }
    await submitFinalRound(pendingResponse);
  }
  const ready = item?.kind === 'ordering' ? ordered.length === item.options.length : selected.length > 0;
  const expected = activity.difficulty === 'medium' ? 4 : 3;
  return <SafeAreaView style={s.safe}><WellnessBackdrop variant={type === 'short_memory_recall' ? 'warm' : 'sky'} /><Header navigation={navigation} title={activity.title} difficulty={activity.difficulty || attempt?.difficulty} icon={icon} accent={accent} soft={soft} />
    <ScrollView contentContainerStyle={s.container}>
      {!attempt && <View style={[s.card, s.intro, { borderTopColor: accent }]}>
        <View style={[s.hero, { backgroundColor: soft }]}><Text style={[s.heroText, { color: accent }]}>{icon}</Text></View>
        <Text style={s.title}>{activity.title || 'Cognitive Engagement'}</Text><Text style={s.description}>{activity.description || 'A short, friendly activity for everyday engagement.'}</Text>
        <View style={s.metaRow}><Meta label="Difficulty" value={formatDifficultyLabel(activity.difficulty || 'easy')} /><Meta label="Rounds" value={expected} /><Meta label="Time" value="About 2 min" /></View>
        <Text style={s.disclaimer}>A relaxing cognitive engagement activityâ€”not a medical assessment.</Text><Button label="Start Activity" onPress={start} loading={loading} color={accent} />
      </View>}
      {attempt && !result && <>
        <View style={s.progressLabels}><Text style={s.progressText}>Round {index + 1} of {total}</Text><Text style={s.progressText}>{Math.round(((index + 1) / total) * 100)}%</Text></View>
        <View style={s.track}><View style={[s.fill, { backgroundColor: accent, width: `${((index + 1) / total) * 100}%` }]} /></View>
        {item?.kind === 'multi_recall' && !studied
          ? <Study item={item} voice={voice} accent={accent} soft={soft} onReady={() => { voice.stopAll(); setStudied(true); itemStarted.current = Date.now(); }} />
          : <View style={[s.card, { borderTopColor: accent }]}>
            <Text style={[s.eyebrow, { color: accent }]}>ROUND {index + 1}</Text>
            {item?.sequence && <View style={[s.sequence, { backgroundColor: soft }]}><Text style={s.sequenceText}>{item.sequence.join('   ')}   ?</Text></View>}
            <Text style={[s.question, type === 'simple_math' && s.math]}>{item?.prompt}</Text>
            <ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(item?.prompt)} />
            {item?.kind === 'ordering'
              ? <Ordering item={item} ordered={ordered} setOrdered={setOrdered} accent={accent} soft={soft} />
              : <View style={s.options}>{item?.options.map((option) => <Answer key={idOf(option)} option={option} selected={selected.includes(idOf(option))} onPress={() => choose(option)} accent={accent} soft={soft} />)}</View>}
            {VOICE_TYPES.has(type) && item?.kind !== 'ordering'
              ? <><VoiceAnswerControl audioState={voice.audioState} disabled={loading} onStart={voice.startListening} onStop={() => voice.stopListening()} /><VoiceStatus audioState={voice.audioState} error={voice.voiceError || voiceChoiceError} transcript={transcript} /></>
              : <Text style={s.touchHint}>Choose using the large cards above.</Text>}
            {feedback ? <View style={s.feedback}><Text style={s.feedbackText}>{feedback}</Text></View> : null}
            <Button label={feedback ? 'Next Round' : 'Check Answer'} onPress={feedback ? advanceAfterFeedback : next} loading={loading} disabled={feedback ? false : !ready} color={accent} />
          </View>}
      </>}
      {result && <Completion result={result} total={total} navigation={navigation} activitySource={result.activity_source || activitySource} activityTitle={activity.title || 'Cognitive Activity'} />}
      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function Header({ navigation, title, difficulty, icon, accent, soft }) { return <View style={[s.header, { backgroundColor: soft }]}><Pressable accessibilityLabel="Go back" style={({ pressed }) => [s.back, pressed && s.pressed]} onPress={() => navigation.goBack()}><Text style={s.backText}>â€¹</Text></Pressable><View style={s.headerIdentity}><Text numberOfLines={1} style={[s.headerIcon, { color: accent }]}>{icon}</Text></View><Text numberOfLines={1} style={s.headerTitle}>{title || 'Cognitive Engagement'}</Text><View style={[s.badge, { borderColor: accent }]}><Text numberOfLines={1} style={[s.badgeText, { color: accent }]}>{formatDifficultyLabel(difficulty || 'easy')}</Text></View></View>; }
function Meta({ label, value }) { return <View style={s.meta}><Text style={s.metaLabel}>{label}</Text><Text style={s.metaValue}>{value}</Text></View>; }
function Answer({ option, selected, onPress, accent, soft }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [s.answer, selected && { borderColor: accent, backgroundColor: soft }, pressed && s.pressed]} onPress={onPress}><Text style={[s.answerText, selected && { color: accent }]}>{labelOf(option)}</Text><View style={[s.selectionMark, { borderColor: selected ? accent : '#A6B2AF', backgroundColor: selected ? accent : '#FFF' }]}>{selected ? <Text style={s.selectionText}>OK</Text> : null}</View></Pressable>; }
function Study({ item, voice, accent, soft, onReady }) { return <View style={[s.card, { borderTopColor: accent }]}><Text style={[s.eyebrow, { color: accent }]}>TAKE A MOMENT</Text><Text style={s.question}>Take a moment to remember these items.</Text><Text style={s.helper}>Look closely and get ready for a short recall round.</Text><View style={s.studyGrid}>{item.studyItems.map((word, index) => <View key={word} style={[s.studyItem, { backgroundColor: soft }]}><View style={[s.studyShape, index % 2 ? s.studyShapeSquare : null, { borderColor: accent }]} /><Text style={s.studyWord}>{word}</Text></View>)}</View><ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(`Take a moment to remember these items. ${item.studyItems.join('. ')}.`)} /><Button label="I'm Ready" onPress={onReady} color={accent} /></View>; }
function Ordering({ item, ordered, setOrdered, accent, soft }) { const remaining = item.options.filter((option) => !ordered.includes(idOf(option))); return <View><Text style={s.helper}>Select each step in the correct order.</Text>{ordered.map((id, index) => <View key={id} style={[s.ordered, { backgroundColor: soft }]}><Text style={[s.orderNumber, { color: accent }]}>{index + 1}</Text><Text style={s.orderText}>{labelOf(item.options.find((option) => idOf(option) === id))}</Text></View>)}{remaining.map((option) => <Answer key={idOf(option)} option={option} onPress={() => setOrdered([...ordered, idOf(option)])} accent={accent} soft={soft} />)}{!!ordered.length && <Pressable style={s.reset} onPress={() => setOrdered([])}><Text style={[s.resetText, { color: accent }]}>Start order again</Text></Pressable>}</View>; }
function Button({ label, loading, disabled, onPress, color }) { return <Pressable style={({ pressed }) => [s.button, { backgroundColor: color }, disabled && s.disabled, pressed && s.pressed]} disabled={disabled || loading} onPress={onPress}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.buttonText}>{label}</Text>}</Pressable>; }
function Completion({ result, total, navigation, activitySource, activityTitle }) {
  const rounds = Number(total || 3);
  const correctCount = Math.max(0, Math.min(rounds, Math.round((Number(result?.accuracy || 0)) * rounds)));
  const nextActivity = activityTitle ? activityTitle.replace(/\b(Word Completion|Odd One Out|Word Category Match|Pattern Sequence|Short Memory Recall|Orientation Activity|Simple Math & Counting|Sequence Ordering)\b/, 'Odd One Out') : 'Odd One Out';
  return <View style={[s.card, s.complete]}><View style={s.checkCircle}><Text style={s.check}>âœ“</Text></View><Text style={s.completeTitle}>Nice work today</Text><Text style={s.completeText}>You completed:</Text><Text style={s.summaryHighlight}>{rounds} {activityTitle || 'activity'} rounds</Text><Text style={s.completeText}>This time:</Text><Text style={s.summaryHighlight}>{correctCount} of {rounds} correct</Text><Text style={s.completeText}>Next activity you may enjoy:</Text><Text style={s.summaryHighlight}>{nextActivity}</Text><View style={s.buttonGroup}>{activitySource === 'self_selected' ? <Pressable style={({ pressed }) => [s.secondary, pressed && s.pressed]} onPress={() => navigation.navigate('CognitiveActivityLibraryScreen')}><Text style={s.secondaryText}>Try Another</Text></Pressable> : null}<Pressable style={({ pressed }) => [s.secondary, pressed && s.pressed]} onPress={() => navigation.popToTop()}><Text style={s.secondaryText}>Finish</Text></Pressable></View></View>;
}
function Metric({ label, value }) { return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>; }

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 }, container: { padding: spacing.xl, paddingBottom: screenInsets.bottom + spacing.xl }, header: { alignItems: 'center', flexDirection: 'row', minHeight: 72 + screenInsets.top, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: screenInsets.top }, back: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: radius.button, height: 48, justifyContent: 'center', width: 48 }, backText: { color: colors.primary, fontSize: 35, lineHeight: 38 }, headerIdentity: { alignItems: 'center', backgroundColor: '#FFFFFF88', borderRadius: radius.small, height: 42, justifyContent: 'center', marginLeft: spacing.sm, width: 48 }, headerIcon: { fontSize: 12, fontWeight: '900' }, headerTitle: { color: colors.text, flex: 1, fontSize: 19, fontWeight: '900', marginHorizontal: spacing.sm }, badge: { backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, maxWidth: 78, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }, badgeText: { fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  card: { ...shadows.level2, backgroundColor: '#FFF', borderColor: colors.border, borderRadius: radius.hero, borderTopWidth: 4, padding: spacing.xxl }, intro: { marginTop: 2 }, hero: { alignItems: 'center', borderRadius: radius.hero, height: 80, justifyContent: 'center', width: 80 }, heroText: { fontSize: 20, fontWeight: '900' }, title: { ...type.screen, color: colors.text, fontSize: 30, marginTop: spacing.lg }, description: { ...type.body, color: colors.secondary, marginTop: spacing.sm }, metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, meta: { backgroundColor: colors.background, borderRadius: radius.small, flex: 1, minHeight: 76, minWidth: 0, padding: spacing.sm }, metaLabel: { color: colors.secondary, fontSize: 11, fontWeight: '800' }, metaValue: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: spacing.sm, textTransform: 'capitalize' }, disclaimer: { ...type.meta, color: colors.secondary, marginTop: spacing.lg, textAlign: 'center' },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' }, progressText: { color: '#294B45', fontSize: 17, fontWeight: '900' }, track: { backgroundColor: '#DCE5E1', borderRadius: 8, height: 12, marginBottom: 19, marginTop: 9, overflow: 'hidden' }, fill: { borderRadius: 8, height: 12 }, eyebrow: { fontSize: 13, fontWeight: '900', letterSpacing: 1.1 }, question: { color: '#172F2B', fontSize: 26, fontWeight: '900', lineHeight: 36, marginTop: 10 }, math: { fontSize: 31, lineHeight: 42, textAlign: 'center' }, sequence: { borderRadius: 18, marginTop: 15, padding: 18 }, sequenceText: { color: '#23443D', fontSize: 23, fontWeight: '900', textAlign: 'center', textTransform: 'capitalize' }, options: { marginTop: 11 },
  answer: { alignItems: 'center', backgroundColor: '#FFF', borderColor: '#CFDCD7', borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 11, minHeight: 68, padding: 16 }, answerText: { color: '#1D302E', fontSize: 19, fontWeight: '700', flex: 1 }, selectionMark: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 28, justifyContent: 'center', marginLeft: spacing.md, width: 28 }, selectionText: { color: '#FFF', fontSize: 12, fontWeight: '900' }, helper: { color: colors.secondary, fontSize: 16, lineHeight: 22, marginTop: 10 }, touchHint: { color: colors.secondary, fontSize: 14, marginTop: spacing.md },
  button: { alignItems: 'center', borderRadius: radius.button, marginTop: spacing.lg, minHeight: 58, paddingVertical: spacing.md }, buttonText: { color: '#FFF', fontSize: 18, fontWeight: '900' }, disabled: { opacity: 0.45 },
  feedback: { backgroundColor: colors.mint, borderRadius: radius.small, marginTop: spacing.md, padding: spacing.md }, feedbackText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  secondary: { alignItems: 'center', backgroundColor: '#FFF', borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, marginTop: spacing.md, minHeight: 52, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, secondaryText: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  complete: { marginTop: spacing.lg }, checkCircle: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 999, height: 72, justifyContent: 'center', marginBottom: spacing.lg, width: 72 }, check: { color: colors.primary, fontSize: 32, fontWeight: '900' }, completeTitle: { color: colors.text, fontSize: 32, fontWeight: '900', marginBottom: spacing.md }, completeText: { color: colors.secondary, fontSize: 18, marginTop: spacing.sm }, summaryHighlight: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: spacing.xs }, buttonGroup: { marginTop: spacing.xl },
  error: { color: '#B42318', fontSize: 14, fontWeight: '700', marginTop: spacing.md },
  studyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, studyItem: { alignItems: 'center', borderRadius: radius.hero, minWidth: 94, padding: spacing.md }, studyShape: { backgroundColor: '#FFFFFF99', borderRadius: 10, height: 20, width: 20 }, studyShapeSquare: { borderRadius: 0 }, studyWord: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: spacing.sm }, ordered: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: radius.small, flexDirection: 'row', marginTop: spacing.sm, padding: spacing.md }, orderNumber: { fontSize: 16, fontWeight: '900', marginRight: spacing.sm }, orderText: { flex: 1, fontWeight: '700' }, reset: { marginTop: spacing.md }, resetText: { fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  metric: { backgroundColor: colors.background, borderRadius: radius.small, flex: 1, padding: spacing.sm }, metricValue: { color: colors.text, fontSize: 17, fontWeight: '900' }, metricLabel: { color: colors.secondary, fontSize: 11, fontWeight: '800', marginTop: spacing.xs },
  studyItemList: { flexDirection: 'row' },
});
203B36', flex: 1, fontSize: 20, fontWeight: '800', lineHeight: 28 }, selectionMark: { alignItems: 'center', borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', marginLeft: 10, width: 28 }, selectionText: { color: colors.white, fontSize: 8, fontWeight: '900' }, touchHint: { color: '#667873', fontSize: 15, fontWeight: '700', marginTop: 14 }, helper: { color: '#5B6E69', fontSize: 17, fontWeight: '700', lineHeight: 25, marginTop: 12 }, studyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }, studyItem: { alignItems: 'center', borderRadius: radius.button, flexGrow: 1, minWidth: '30%', padding: spacing.lg }, studyShape: { borderRadius: 14, borderWidth: 3, height: 28, marginBottom: spacing.sm, width: 28 }, studyShapeSquare: { borderRadius: 6, transform: [{ rotate: '12deg' }] }, studyWord: { color: '#273F3A', fontSize: 18, fontWeight: '900' },  ordered: { alignItems: 'center', borderRadius: 17, flexDirection: 'row', marginTop: 10, minHeight: 61, padding: 13 }, orderNumber: { fontSize: 22, fontWeight: '900', marginRight: 11, width: 28 }, orderText: { color: '#203B36', flex: 1, fontSize: 18, fontWeight: '800' }, reset: { alignSelf: 'center', minHeight: 52, padding: 14 }, resetText: { fontSize: 16, fontWeight: '900' }, button: { alignItems: 'center', borderRadius: radius.button, justifyContent: 'center', marginTop: spacing.xl, minHeight: 58, padding: spacing.md }, disabled: { opacity: 0.42 }, buttonText: { ...type.button, color: '#FFF' },
  complete: { alignItems: 'center', borderTopColor: '#69A98C' }, checkCircle: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 38, height: 76, justifyContent: 'center', width: 76 }, check: { color: colors.primary, fontSize: 14, fontWeight: '900' }, completeTitle: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 15 }, completeText: { color: colors.secondary, fontSize: 18, fontWeight: '700', marginTop: 8, textAlign: 'center' }, accuracyHero: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: radius.card, marginTop: spacing.xl, padding: spacing.xl, width: '100%' }, accuracyHeroValue: { color: colors.primary, fontSize: 42, fontWeight: '900' }, accuracyHeroLabel: { ...type.meta, color: colors.secondary, marginTop: spacing.xs }, metricGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, metric: { backgroundColor: colors.background, borderRadius: radius.button, flex: 1, minWidth: 0, padding: spacing.md }, metricValue: { color: colors.text, fontSize: 19, fontWeight: '900', textTransform: 'capitalize' }, metricLabel: { color: colors.secondary, fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 5 }, secondary: { alignItems: 'center', borderColor: colors.primary, borderRadius: radius.button, borderWidth: 1.5, justifyContent: 'center', marginTop: 12, minHeight: 58, width: '100%' }, secondaryText: { color: colors.primary, fontSize: 18, fontWeight: '900' }, error: { color: colors.error, fontSize: 17, fontWeight: '800', lineHeight: 24, marginTop: 18 }, pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
