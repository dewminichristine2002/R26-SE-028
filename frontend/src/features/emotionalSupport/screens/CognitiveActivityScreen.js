import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { startAdaptiveActivity, submitAdaptiveActivity } from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import useEnglishVoice from '../voice/useEnglishVoice';
import { mapTranscriptToVisibleOption } from '../voice/voiceUtils';
import { resolveItemIllustration } from '../utils/cognitiveItemIllustrations';
import { activityStyles, colors, radius, screenInsets, shadows, spacing } from '../theme';

const palette = {
  primary: colors.primary, primaryDark: colors.primaryDark, dark: colors.text, text: colors.text,
  muted: colors.secondary, background: colors.background, surface: colors.surface, tint: colors.mint,
  border: colors.border, selected: colors.mint, success: colors.mint, successText: colors.primaryDark,
  gold: colors.gold, error: colors.error, errorTint: colors.errorBg, white: colors.white,
};

const VOICE_TYPES = new Set(['word_category', 'odd_one_out', 'word_completion', 'short_memory_recall', 'orientation_activity', 'simple_math']);
const idOf = (value) => String(typeof value === 'string' ? value : value.id);
const labelOf = (value) => String(typeof value === 'string' ? value : value.label);
const typeOf = (attempt, activity) => attempt?.task?.activityType || String(activity?.activity_code || '').replace(/_(easy|medium|hard)$/, '');
const formatDifficultyLabel = (value) => ({ easy: 'Gentle', medium: 'A Little More Challenge', hard: 'More Challenge' }[String(value || 'easy').toLowerCase()] || 'Gentle');
const difficultyName = (value) => ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' }[String(value || 'easy').toLowerCase()] || 'Easy');
const difficultyDescription = (value) => ({ easy: 'A comfortable place to begin.', medium: 'A little more to think about.', hard: 'A fuller set of rounds, at your pace.' }[String(value || 'easy').toLowerCase()] || 'Choose the pace that feels right.');

export default function CognitiveActivityScreen({ navigation, route }) {
  const { width, fontScale } = useWindowDimensions();
  const narrowLayout = width < 350 || fontScale > 1.25;
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
  const [typedAnswer, setTypedAnswer] = useState(''); const [showHint, setShowHint] = useState(false);
  const [answerValidation, setAnswerValidation] = useState('');
  const entrance = useRef(new Animated.Value(1)).current;
  const type = typeOf(attempt, activity);
  const look = activityStyles[type] || { symbol: 'PLAY', accent: palette.primary, soft: palette.tint };
  const { symbol: icon, accent } = look;
  const items = attempt?.task?.items || (attempt?.task ? [{ ...attempt.task, id: 'legacy-item' }] : []);
  const item = items[index]; const total = attempt?.task?.totalItems || items.length;
  const requiredLetterCount = Math.max(1, (String(item?.prompt || '').match(/_/g) || []).length);

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, { toValue: 1, duration: 190, useNativeDriver: true }).start();
  }, [entrance, index, studied, result]);

  const onTranscript = useCallback((text) => {
    setTranscript(text);
    if (type === 'word_completion') { setTypedAnswer(text); setAnswerValidation(''); setVoiceChoiceError(''); return; }
    const match = mapTranscriptToVisibleOption(text, item?.options || []);
    if (!match) { setVoiceChoiceError('That did not exactly match a visible choice. Please try again or tap an answer.'); return; }
    setVoiceChoiceError(''); const id = idOf(match);
    setSelected((values) => item?.kind === 'multi_recall' ? (values.includes(id) ? values : [...values, id]) : [id]);
  }, [item, type]);
  const voice = useEnglishVoice({ onTranscript });

  async function start() {
    try { setLoading(true); setError(''); setAttempt(await startAdaptiveActivity({ ...context, activity_code: activity.activity_code, difficulty: activity.difficulty })); itemStarted.current = Date.now(); }
    catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  function choose(option) { const id = idOf(option); setSelected((values) => item.kind === 'multi_recall' ? (values.includes(id) ? values.filter((value) => value !== id) : [...values, id]) : [id]); }
  function buildResponse() {
    return { itemId: item.id, responseTimeMs: Math.max(0, Date.now() - itemStarted.current), ...(item.kind === 'multi_recall' ? { selectedAnswers: selected } : item.kind === 'ordering' ? { orderedAnswers: ordered } : { selectedAnswer: type === 'word_completion' ? typedAnswer.trim() : selected[0] }) };
  }
  function resetRoundState() {
    setSelected([]); setOrdered([]); setStudied(false); setTranscript(''); setTypedAnswer(''); setAnswerValidation(''); setShowHint(false); setVoiceChoiceError(''); setFeedback(null); setPendingResponse(null); itemStarted.current = Date.now();
  }
  async function submitFinalRound(response) {
    try {
      voice.stopAll(); setLoading(true); setError(''); setResult(await submitAdaptiveActivity(attempt.attempt_id, { user_id: context.user_id, response: attempt.task.items ? { itemResponses: [...responses, response] } : response }));
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  async function next() {
    if (type === 'word_completion') {
      const answer = typedAnswer.trim();
      if (!answer) { setAnswerValidation('Please enter the missing letter.'); return; }
          if (!/^[a-z]+$/i.test(answer) || answer.length !== requiredLetterCount) {
            setAnswerValidation(requiredLetterCount === 1 ? 'Please enter one letter only.' : `Please enter all ${requiredLetterCount} missing letters.`);
            return;
          }
    }
    const response = buildResponse();
    const message = 'Nice work staying with it. Take your time with the next one.';
    if (index < items.length - 1) { setPendingResponse(response); setFeedback(message); return; }
    await submitFinalRound(response);
  }
  async function advanceAfterFeedback() {
    if (!pendingResponse) return;
    const all = [...responses, pendingResponse];
    if (index < items.length - 1) { voice.stopAll(); setResponses(all); setIndex(index + 1); resetRoundState(); return; }
    await submitFinalRound(pendingResponse);
  }
  const ready = type === 'word_completion' ? typedAnswer.trim().length > 0 : item?.kind === 'ordering' ? ordered.length === item.options.length : selected.length > 0;
  const expected = attempt?.task?.totalItems || (activity.difficulty === 'hard' ? 5 : activity.difficulty === 'medium' ? 4 : 3);
  const progress = total ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle={attempt ? 'light-content' : 'dark-content'} backgroundColor={attempt ? palette.primary : palette.background} />
      {attempt
        ? <Header navigation={navigation} title={activity.title} icon={icon} difficulty={activity.difficulty} />
        : <IntroNav navigation={navigation} />}
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!attempt && <View style={s.card}>
          <View style={s.introHero}>
            <View style={[s.heroMark, { backgroundColor: look.soft }]}><Text style={[s.heroMarkText, { color: look.accent }]}>{icon}</Text></View>
            <View style={s.heroCopy}><Text style={s.heroEyebrow}>A MOMENT TO PLAY</Text><Text accessibilityRole="header" style={s.heroTitle}>{activity.title || 'Cognitive Activity'}</Text></View>
          </View>
          <Text style={s.description}>{activity.description || 'A short, friendly activity for everyday engagement.'}</Text>
          <View style={s.difficultyPanel}>
            <View style={s.difficultyPanelCopy}><Text style={s.metaLabel}>YOUR PACE</Text><Text style={s.difficultyName}>{difficultyName(activity.difficulty || 'easy')}</Text><Text style={s.difficultyDescription}>{difficultyDescription(activity.difficulty || 'easy')}</Text></View>
            <View style={s.difficultyMark}><Text style={s.difficultyMarkText}>{'✓'}</Text></View>
          </View>
          <View style={[s.metaRow, narrowLayout && s.metaRowStacked]}><Meta label="ROUNDS" value={expected} stacked={narrowLayout} /><Meta label="TIME" value="About 2 min" stacked={narrowLayout} /></View>
          <View style={s.disclaimerBox}><Text style={s.disclaimerMark}>i</Text><Text style={s.disclaimer}>A gentle engagement activity, not a medical assessment.</Text></View>
          <Button label="Start Game" onPress={start} loading={loading} disabled={loading} />
        </View>}

        {attempt && !result && items.length > 0 && <>
          <View style={[s.progressCard, { borderLeftColor: accent }]} accessibilityLabel={`Round ${index + 1} of ${total}`}>
            <View style={s.progressTop}><View><Text style={s.progressEyebrow}>YOUR PROGRESS</Text><Text style={s.progressTitle}>Round {index + 1} of {total}</Text></View><View style={s.percentPill}><Text style={s.percentText}>{progress}%</Text></View></View>
            <View style={s.track}><View style={[s.fill, { backgroundColor: accent, width: `${progress}%` }]} /></View>
          </View>
          <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }] }}>
            {item?.kind === 'multi_recall' && !studied
              ? <Study item={item} voice={voice} stacked={narrowLayout} onReady={() => { voice.stopAll(); setStudied(true); itemStarted.current = Date.now(); }} />
              : <View style={[s.gameCard, { borderTopColor: accent }]}>
                <View style={s.gameCardTop}><Text style={s.eyebrow}>{item?.kind === 'multi_recall' ? 'RECALL' : `ROUND ${index + 1}`}</Text><ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(item?.prompt)} /></View>
                {type === 'word_completion' ? <WordPrompt prompt={item?.prompt} />
                  : type === 'pattern_sequence' ? <PatternSequence sequence={item?.sequence || []} />
                    : type === 'word_category' ? <CategoryPrompt prompt={item?.prompt} />
                      : type === 'odd_one_out' ? <OddPrompt prompt={item?.prompt} />
                        : type === 'simple_math' ? <MathPrompt prompt={item?.prompt} />
                          : type === 'orientation_activity' ? <OrientationPrompt prompt={item?.prompt} />
                            : <Text style={s.question}>{item?.prompt}</Text>}
                {type === 'word_completion'
                  ? <><TextInput accessibilityLabel={requiredLetterCount === 1 ? 'Type the missing letter' : `Type the ${requiredLetterCount} missing letters`} autoCapitalize="characters" autoCorrect={false} maxLength={requiredLetterCount} onChangeText={(value) => { setTypedAnswer(value); setAnswerValidation(''); }} placeholder={requiredLetterCount === 1 ? 'Enter the missing letter' : `Enter ${requiredLetterCount} missing letters`} placeholderTextColor="#718A85" returnKeyType="done" style={s.textInput} value={typedAnswer} /><Text accessibilityLiveRegion="polite" style={answerValidation ? s.answerValidation : s.answerHelper}>{answerValidation || `Enter ${requiredLetterCount === 1 ? 'the one missing letter' : `all ${requiredLetterCount} missing letters`}.`}</Text></>
                  : item?.kind === 'ordering'
                    ? <Ordering item={item} ordered={ordered} setOrdered={setOrdered} />
                    : type === 'pattern_sequence'
                      ? <PatternChoices options={item?.options || []} selected={selected} onChoose={choose} />
                      : <View style={type === 'odd_one_out' || type === 'word_category' || item?.kind === 'multi_recall' ? [s.optionGrid, narrowLayout && s.optionGridStacked] : s.options}>{item?.options.map((option, optionIndex) => {
                      const illustrated = type === 'odd_one_out' || type === 'word_category' || item?.kind === 'multi_recall';
                      return <Answer key={idOf(option)} option={option} index={optionIndex} selected={selected.includes(idOf(option))} onPress={() => choose(option)} compact={illustrated} stacked={narrowLayout} gameType={type} />;
                    })}</View>}
                {VOICE_TYPES.has(type) && item?.kind !== 'ordering'
                  ? <View style={s.voiceBlock}><VoiceAnswerControl audioState={voice.audioState} disabled={loading} onStart={voice.startListening} onStop={() => voice.stopListening()} /><VoiceStatus audioState={voice.audioState} error={voice.voiceError || voiceChoiceError} transcript={transcript} /></View>
                  : item?.kind === 'ordering' ? null : <Text style={s.touchHint}>Choose a card to continue.</Text>}
                {type === 'word_completion' && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHint }} onPress={() => setShowHint((value) => !value)} style={s.hintButton}><View style={s.hintIcon}><Text style={s.hintIconText}>?</Text></View><Text style={s.hintButtonText}>{showHint ? 'Hide hint' : 'Show hint'}</Text><Text style={s.hintChevron}>{showHint ? '−' : '+'}</Text></Pressable>}
                {showHint && type === 'word_completion' && <HintCard text={item?.hint || 'Say the letters aloud and think of a familiar everyday word.'} />}
                {type === 'odd_one_out' && item?.hint && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHint }} onPress={() => setShowHint((value) => !value)} style={s.hintButton}><View style={s.hintIcon}><Text style={s.hintIconText}>?</Text></View><Text style={s.hintButtonText}>{showHint ? 'Hide hint' : 'Show a hint'}</Text><Text style={s.hintChevron}>{showHint ? '−' : '+'}</Text></Pressable>}
                {showHint && type === 'odd_one_out' && item?.hint && <HintCard text={item.hint} />}
                {feedback && <View accessibilityLiveRegion="polite" style={s.feedback}><View style={s.feedbackIcon}><Text style={s.feedbackIconText}>i</Text></View><Text style={s.feedbackText}>{feedback}</Text></View>}
                <Button label={feedback ? 'Next round' : 'Check answer'} onPress={feedback ? advanceAfterFeedback : next} loading={loading} disabled={feedback ? loading : (type === 'word_completion' ? loading : !ready || loading)} />
                {!feedback && <Pressable accessibilityRole="button" disabled={loading} onPress={() => {
                  const skipped = { itemId: item.id, skipped: true, responseTimeMs: 0 };
                  if (index < items.length - 1) { setResponses((values) => [...values, skipped]); setIndex((value) => value + 1); resetRoundState(); }
                  else submitFinalRound(skipped);
                }} style={({ pressed }) => [s.skipButton, pressed && s.pressed, loading && s.disabledLink]}><Text style={s.skipButtonText}>Skip this question</Text></Pressable>}
              </View>}
          </Animated.View>
        </>}

        {attempt && !result && !items.length && <StatusCard title="This activity is not ready" message="There are no rounds available right now. Please return and choose another activity." />}
        {result && <CompletionSummary result={result} total={total} navigation={navigation} activityContext={context} activitySource={result.activity_source || activitySource} activityTitle={activity.title || 'Cognitive Activity'} />}
        {!!error && <StatusCard title="We couldn’t continue just now" message={error} error />}
      </ScrollView>
    </SafeAreaView>
  );
}

function IntroNav({ navigation }) {
  return <View style={s.introNav}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={({ pressed }) => [s.introBack, pressed && s.pressed]} onPress={() => navigation.goBack()}><Text style={s.introBackText}>{'\u2039'}</Text></Pressable>
    <Text style={s.introNavLabel}>COGNITIVE ACTIVITIES</Text>
  </View>;
}

function Header({ navigation, title, icon, difficulty }) {
  return <View style={s.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={({ pressed }) => [s.back, pressed && s.pressed]} onPress={() => navigation.goBack()}><Text style={s.backText}>{'\u2039'}</Text></Pressable>
    <View style={s.headerIcon}><Text style={s.headerIconText}>{icon}</Text></View>
    <View style={s.headerCopy}>
      <View style={s.headerOverline}><Text style={s.headerEyebrow}>COGNITIVE ACTIVITY</Text><View style={s.headerDifficulty}><Text style={s.headerDifficultyText}>{difficultyName(difficulty)}</Text></View></View>
      <Text accessibilityRole="header" style={s.headerTitle}>{title || 'Cognitive Activity'}</Text>
    </View>
  </View>;
}

function Meta({ label, value, stacked }) {
  return <View style={[s.meta, stacked && s.metaStacked]}><Text style={s.metaLabel}>{label}</Text><Text numberOfLines={2} style={s.metaValue}>{value}</Text></View>;
}

function WordPrompt({ prompt }) {
  const text = String(prompt || 'Complete the word');
  const match = text.match(/:\s*(.+)$/);
  const letters = match?.[1]?.trim().split('') || [];
  return <View accessibilityLabel={text} accessible style={s.wordPrompt}>
    <Text style={s.wordPromptLabel}>COMPLETE THE WORD</Text>
    {letters.length ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.letterRow}>{letters.map((letter, index) => letter === ' '
      ? <View key={`space-${index}`} style={s.letterSpace} />
      : <View key={`${letter}-${index}`} style={[s.letterTile, letter === '_' && s.missingLetter]}><Text style={[s.letterText, letter === '_' && s.missingLetterText]}>{letter === '_' ? '?' : letter.toUpperCase()}</Text></View>)}</View>
      : <Text style={s.question}>{text}</Text>}
  </View>;
}

function PatternSequence({ sequence }) {
  return <View accessible accessibilityLabel={`Pattern: ${sequence.join(', ')}, then choose what comes next`} style={s.patternPanel}>
    <Text style={s.patternLabel}>NOTICE THE PATTERN</Text>
    <View style={s.patternTiles}>
      {sequence.map((symbol, index) => <View key={`${symbol}-${index}`} style={[s.patternTile, index % 2 === 1 && s.patternTileAlt]}><Text style={s.patternTileText}>{patternGlyphFor(symbol)}</Text></View>)}
      <View style={s.patternMissing}><Text style={s.patternMissingText}>?</Text></View>
    </View>
  </View>;
}

function CategoryPrompt({ prompt }) {
  return <View style={[s.gamePrompt, s.categoryPrompt]}>
    <Text style={s.promptEyebrow}>WORD CATEGORY MATCH</Text>
    <Text accessibilityRole="header" style={s.question}>{prompt}</Text>
    <Text style={s.promptHelper}>Choose the item that best fits the question.</Text>
  </View>;
}

function OddPrompt({ prompt }) {
  return <View style={[s.gamePrompt, s.oddPrompt]}>
    <Text style={s.promptEyebrow}>LOOK FOR WHAT IS DIFFERENT</Text>
    <Text accessibilityRole="header" style={s.question}>{prompt}</Text>
    <Text style={s.promptHelper}>Take a look at each familiar item.</Text>
  </View>;
}

function MathPrompt({ prompt }) {
  return <View style={[s.gamePrompt, s.mathPrompt]}>
    <View style={s.mathBadge}><Text style={s.mathBadgeText}>123</Text></View>
    <Text style={s.promptEyebrow}>NUMBER MOMENT</Text>
    <Text accessibilityRole="header" style={[s.question, s.mathQuestion]}>{prompt}</Text>
    <Text style={s.promptHelper}>Work it out at your own pace.</Text>
  </View>;
}

function OrientationPrompt({ prompt }) {
  return <View style={[s.gamePrompt, s.orientationPrompt]}>
    <View style={s.orientationBadge}><Text style={s.orientationBadgeText}>DAY</Text></View>
    <Text style={s.promptEyebrow}>EVERYDAY TIME & ORDER</Text>
    <Text accessibilityRole="header" style={s.question}>{prompt}</Text>
    <Text style={s.promptHelper}>Choose the answer that fits.</Text>
  </View>;
}

function PatternChoices({ options, selected, onChoose }) {
  return <View style={s.patternChoices}>
    {options.map((option) => {
      const value = option.visual || option.label || option.id;
      const color = exactPatternColor(value);
      return <Pressable key={idOf(option)} accessibilityRole="button" accessibilityLabel={labelOf(option)} accessibilityState={{ selected: selected.includes(idOf(option)) }} onPress={() => onChoose(option)} style={({ pressed }) => [s.patternChoice, selected.includes(idOf(option)) && s.patternChoiceSelected, pressed && s.pressed]}>
        <View style={[s.patternChoiceTile, color ? { backgroundColor: color } : null]}><Text style={[s.patternChoiceGlyph, color && s.patternChoiceColorLabel]}>{patternGlyphFor(value)}</Text></View>
        <Text style={s.patternChoiceLabel}>{labelOf(option)}</Text>
        {selected.includes(idOf(option)) && <Text style={s.patternChoiceCheck}>{'\\u2713'}</Text>}
      </Pressable>;
    })}
  </View>;
}

function patternGlyphFor(value) {
  const name = String(value || '').trim().toLowerCase();
  if (/circle|round|^o$/.test(name)) return '●';
  if (/square|box/.test(name)) return '■';
  if (/triangle/.test(name)) return '▲';
  if (/star/.test(name)) return '★';
  if (/diamond/.test(name)) return '◆';
  return String(value);
}

function ItemIllustration({ label, compact = false }) {
  const illustration = resolveItemIllustration(label);
  return <View accessible accessibilityLabel={`${illustration.label} illustration`} style={[s.optionIllustration, compact && s.optionIllustrationLarge, illustration.kind === 'text' && s.textIllustration]}>
    <Text style={[s.optionIllustrationText, compact && s.optionIllustrationTextLarge, illustration.kind === 'text' && s.textIllustrationLabel]}>{illustration.kind === 'illustration' ? illustration.glyph : illustration.text}</Text>
  </View>;
}

function Answer({ option, index, selected, onPress, compact, stacked, showItemIcon = false, gameType }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={labelOf(option)} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [s.answer, compact && s.answerCompact, gameType === 'odd_one_out' && s.oddAnswer, gameType === 'word_category' && s.categoryAnswer, stacked && s.answerStacked, selected && s.answerSelected, pressed && s.pressed]}>
    {compact || showItemIcon ? <ItemIllustration label={labelOf(option)} compact={compact} /> : null}
    {!compact && <View style={[s.answerNumber, selected && s.answerNumberSelected]}><Text style={[s.answerNumberText, selected && s.answerNumberTextSelected]}>{String(index + 1).padStart(2, '0')}</Text></View>}
    <Text style={[s.answerText, compact && s.answerTextCompact, stacked && compact && s.answerTextStacked, selected && s.answerTextSelected]}>{labelOf(option)}</Text>
    <View style={[s.selectionMark, selected && s.selectionMarkSelected]}>{selected ? <Text style={s.selectionText}>✓</Text> : null}</View>
  </Pressable>;
}

function Study({ item, voice, onReady, stacked }) {
  return <View style={s.gameCard}>
    <View style={s.phaseBadge}><View style={s.phaseDot} /><Text style={s.phaseText}>MEMORIZE</Text></View>
    <Text style={s.question}>Take a moment to remember these items.</Text>
    <Text style={s.helper}>Look at each familiar object. There is no timer.</Text>
    <View style={[s.studyGrid, stacked && s.studyGridStacked]}>{item.studyItems.map((word, index) => <View key={word} style={[s.studyItem, stacked && s.studyItemStacked]}>
      <ItemIllustration label={word} compact />
      <View style={s.studyCopy}><Text style={s.studyNumberText}>ITEM {String(index + 1).padStart(2, '0')}</Text><Text style={s.studyWord}>{word}</Text></View>
    </View>)}</View>
    <ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(`Take a moment to remember these items. ${item.studyItems.join('. ')}.`)} />
    <Button label="I’m ready to recall" onPress={onReady} />
  </View>;
}

function HintCard({ text }) {
  return <View style={s.hintCard}><View style={s.hintIcon}><Text style={s.hintIconText}>i</Text></View><View style={s.hintCopy}><Text style={s.hintEyebrow}>A SMALL CLUE</Text><Text style={s.hintText}>{text}</Text></View></View>;
}

function Ordering({ item, ordered, setOrdered }) {
  const remaining = item.options.filter((option) => !ordered.includes(idOf(option)));
  return <View><View style={s.orderProgress}><Text style={s.orderProgressLabel}>YOUR ORDER</Text><Text style={s.orderProgressValue}>{ordered.length} of {item.options.length} steps</Text></View><Text style={s.helper}>Select each step in the order that feels right.</Text>
    {ordered.map((id, index) => {
      const option = item.options.find((candidate) => idOf(candidate) === id);
      return <View key={id} style={s.ordered}><View style={s.orderNumber}><Text style={s.orderNumberText}>{index + 1}</Text></View><ItemIllustration label={labelOf(option)} /><Text style={s.orderText}>{labelOf(option)}</Text></View>;
    })}
    {remaining.map((option, index) => <Answer key={idOf(option)} option={option} index={index} onPress={() => setOrdered([...ordered, idOf(option)])} showItemIcon />)}
    {!!ordered.length && <Pressable accessibilityRole="button" onPress={() => setOrdered([])} style={s.resetButton}><Text style={s.resetText}>Start order again</Text></Pressable>}
  </View>;
}

function Button({ label, loading, disabled, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }} style={({ pressed }) => [s.button, disabled && s.buttonDisabled, pressed && !disabled && s.pressed]} disabled={disabled || loading} onPress={onPress}>
    {loading ? <ActivityIndicator color={palette.white} /> : <><Text style={s.buttonText}>{label}</Text><Text style={s.buttonArrow}>{'\u203A'}</Text></>}
  </Pressable>;
}

function StatusCard({ title, message, error = false }) {
  return <View accessibilityLiveRegion="polite" style={[s.statusCard, error && s.statusError]}><View style={[s.statusIcon, error && s.statusIconError]}><Text style={s.statusIconText}>{error ? '!' : 'i'}</Text></View><View style={s.statusCopy}><Text style={s.statusTitle}>{title}</Text><Text style={s.statusText}>{message}</Text></View></View>;
}

function CompletionSummary({ result, total, navigation, activityContext, activitySource, activityTitle }) {
  const rounds = Number(result?.total_items || total || 0);
  const skipped = Math.min(rounds, Math.max(0, Number(result?.skipped_items || 0)));
  const completed = Math.max(0, rounds - skipped);
  const correct = Math.max(0, Math.min(completed, Number(result?.correct_answers ?? Math.round(Number(result?.accuracy || 0) * completed))));
  return <View style={s.completionCard}>
    <View style={s.completionMark}><Text style={s.completionCheck}>✓</Text></View>
    <Text style={s.completionEyebrow}>ACTIVITY COMPLETE</Text>
    <Text style={s.completionTitle}>Nice work today</Text>
    <Text style={s.completionSubtitle}>{result?.activity_title || activityTitle} · {formatDifficultyLabel(result?.difficulty)}</Text>
    <View style={s.scorePanel}>
      <View style={[s.scoreMetric, s.scoreMetricCard]}><Text style={s.scoreValue}>{completed}<Text style={s.scoreTotal}> / {rounds}</Text></Text><Text style={s.scoreLabel}>answered</Text><Text style={s.skippedLabel}>{skipped} skipped</Text></View>
      <View style={[s.scoreMetric, s.scoreMetricCard]}><Text style={s.scoreValue}>{correct}</Text><Text style={s.scoreLabel}>correct</Text></View>
    </View>
    <Text style={s.completionMessage}>{result?.feedback || 'Thank you for taking part. Every round is a chance to pause and engage.'}</Text>
    <View style={s.completionActions}>
      <Pressable accessibilityRole="button" style={({ pressed }) => [s.button, pressed && s.pressed]} onPress={() => navigation.navigate('CognitiveActivityScreen', { recommended_activity: { activity_code: result?.activity_code, title: activityTitle, difficulty: result?.next_difficulty || result?.difficulty || 'easy' }, activity_context: activityContext, activity_source: activitySource })}><Text style={s.buttonText}>Play Again</Text><Text style={s.buttonArrow}>{'\u203A'}</Text></Pressable>
      <Pressable accessibilityRole="button" style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]} onPress={() => activitySource === 'recommended' ? navigation.goBack() : navigation.navigate('CognitiveActivityLibraryScreen')}><Text style={s.secondaryButtonText}>{activitySource === 'recommended' ? 'Return to Results' : 'Try Another Activity'}</Text></Pressable>
      <Pressable accessibilityRole="button" style={({ pressed }) => [s.homeButton, pressed && s.pressed]} onPress={() => navigation.popToTop()}><Text style={s.homeButtonText}>Return Home</Text></Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: palette.background, flex: 1 },
  introNav: { alignItems: 'center', backgroundColor: palette.background, flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  introBack: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: radius.pill, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  introBackText: { color: palette.primary, fontSize: 34, lineHeight: 38 }, introNavLabel: { color: palette.primary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  header: { alignItems: 'center', backgroundColor: palette.primary, borderBottomColor: palette.gold, borderBottomWidth: 3, flexDirection: 'row', gap: 11, paddingHorizontal: 18, paddingVertical: 15 },
  back: { alignItems: 'center', backgroundColor: '#FFFFFF20', borderColor: '#FFFFFF75', borderRadius: 16, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  backText: { color: palette.white, fontSize: 34, lineHeight: 38 },
  headerIcon: { alignItems: 'center', backgroundColor: '#FFFFFF20', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  headerIconText: { color: palette.white, fontSize: 21, fontWeight: '900' },
  headerCopy: { flex: 1, minWidth: 0 }, headerOverline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, headerEyebrow: { color: '#FFF4B8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  headerDifficulty: { backgroundColor: '#FFFFFF20', borderColor: '#FFFFFF55', borderRadius: radius.pill, borderWidth: 1, marginLeft: 6, paddingHorizontal: 9, paddingVertical: 4 }, headerDifficultyText: { color: palette.white, fontSize: 11, fontWeight: '900' },
  headerTitle: { color: palette.white, flexShrink: 1, fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 2 },
  container: { paddingBottom: screenInsets.bottom + spacing.xl, paddingHorizontal: 18, paddingTop: 18 },
  card: { backgroundColor: palette.surface, borderColor: palette.gold, borderRadius: radius.hero, borderWidth: 1.5, padding: 18, ...shadows.level2 },
  introHero: { alignItems: 'center', backgroundColor: palette.primary, borderColor: palette.gold, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 112, padding: 16 },
  heroMark: { alignItems: 'center', borderColor: '#FFF4B8', borderRadius: 19, borderWidth: 1, height: 62, justifyContent: 'center', width: 62 },
  heroMarkText: { fontSize: 25, fontWeight: '900' }, heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: '#FFF4B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: palette.white, fontSize: 24, fontWeight: '900', lineHeight: 30, marginTop: 4 },
  description: { color: palette.muted, fontSize: 17, lineHeight: 25, marginTop: 17 },
  difficultyPanel: { alignItems: 'center', backgroundColor: '#fff4b8', borderColor: '#e5c44f', borderRadius: 17, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, minHeight: 82, paddingHorizontal: 15, paddingVertical: 11 },
  difficultyPanelCopy: { flex: 1 }, difficultyName: { color: palette.primary, fontSize: 20, fontWeight: '900', lineHeight: 26, marginTop: 2 },
  difficultyDescription: { color: '#5e5143', fontSize: 14, lineHeight: 20, marginTop: 1 },
  difficultyMark: { alignItems: 'center', backgroundColor: palette.primary, borderRadius: 15, height: 38, justifyContent: 'center', marginLeft: 9, width: 38 },
  difficultyMarkText: { color: palette.white, fontSize: 20, fontWeight: '900' },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, metaRowStacked: { flexDirection: 'column' },
  meta: { backgroundColor: '#f4f6f2', borderColor: palette.border, borderRadius: 15, borderWidth: 1, flex: 1, minHeight: 70, minWidth: 0, padding: 12 },
  metaStacked: { flexBasis: 'auto', minHeight: 60, width: '100%' }, metaLabel: { color: palette.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.3, lineHeight: 16 },
  metaValue: { color: palette.dark, fontSize: 17, fontWeight: '900', lineHeight: 22, marginTop: 4 },
  disclaimerBox: { alignItems: 'center', backgroundColor: '#e3f8ee', borderColor: '#b8ead6', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 14, padding: 12 },
  disclaimerMark: { alignItems: 'center', backgroundColor: palette.surface, borderColor: '#b8ead6', borderRadius: 12, borderWidth: 1, color: palette.primary, fontSize: 15, fontWeight: '900', height: 30, lineHeight: 27, textAlign: 'center', width: 30 },
  disclaimer: { color: palette.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  progressCard: { backgroundColor: palette.surface, borderColor: palette.border, borderLeftWidth: 4, borderRadius: 18, borderWidth: 1, marginBottom: 14, padding: 15, ...shadows.level1 },
  progressTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, progressEyebrow: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  progressTitle: { color: palette.dark, fontSize: 19, fontWeight: '900', marginTop: 3 }, progressTotal: { color: palette.muted, fontSize: 16, fontWeight: '700' },
  percentPill: { alignItems: 'center', backgroundColor: '#fff4b8', borderColor: '#e5c44f', borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 38, minWidth: 58, paddingHorizontal: 10 },
  percentText: { color: palette.primary, fontSize: 15, fontWeight: '900' }, track: { backgroundColor: '#eadfcd', borderRadius: 9, height: 11, marginTop: 13, overflow: 'hidden' },
  fill: { backgroundColor: palette.gold, borderRadius: 9, height: 11 },
  gameCard: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 23, borderTopColor: palette.gold, borderTopWidth: 4, borderWidth: 1, padding: 18, ...shadows.level2 },
  gameCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  question: { color: palette.dark, fontSize: 24, fontWeight: '900', lineHeight: 32, marginTop: 13 }, math: { backgroundColor: '#fff4b8', borderRadius: 18, fontSize: 34, lineHeight: 46, marginTop: 18, overflow: 'hidden', padding: 20, textAlign: 'center' },
  gamePrompt: { borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 16 },
  categoryPrompt: { backgroundColor: '#F1ECFA', borderColor: '#D9C9F1' }, oddPrompt: { backgroundColor: '#EAF5FA', borderColor: '#C5DEEA' },
  mathPrompt: { alignItems: 'center', backgroundColor: '#FFF6D8', borderColor: '#E8D88F' }, orientationPrompt: { backgroundColor: '#EAF6F0', borderColor: '#C6E3D3' },
  promptEyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  promptHelper: { color: palette.muted, fontSize: 15, lineHeight: 21, marginTop: 7 },
  mathBadge: { alignItems: 'center', backgroundColor: '#F1E3A6', borderRadius: 20, height: 48, justifyContent: 'center', marginBottom: 9, width: 48 },
  mathBadgeText: { color: '#6B5200', fontSize: 17, fontWeight: '900' }, mathQuestion: { alignSelf: 'stretch', marginTop: 7, textAlign: 'center' },
  orientationBadge: { alignItems: 'center', backgroundColor: '#CFEBDD', borderRadius: 18, height: 42, justifyContent: 'center', marginBottom: 9, width: 42 },
  orientationBadgeText: { color: '#286448', fontSize: 12, fontWeight: '900' },
  gameCue: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 14, minHeight: 40, paddingHorizontal: 12 }, gameCueSymbol: { fontSize: 18, fontWeight: '900' }, gameCueLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  patternPanel: { alignItems: 'center', backgroundColor: '#f4f6f2', borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 15, padding: 16 },
  patternLabel: { alignSelf: 'flex-start', color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  patternTiles: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  patternTile: { alignItems: 'center', backgroundColor: '#e3f8ee', borderColor: '#b8ead6', borderRadius: 13, borderWidth: 1, height: 56, justifyContent: 'center', minWidth: 56, paddingHorizontal: 9 },
  patternTileAlt: { backgroundColor: '#eaf7ff', borderColor: '#cae3f2' }, patternTileText: { color: palette.dark, fontSize: 24, fontWeight: '900' },
  patternMissing: { alignItems: 'center', backgroundColor: '#fff4b8', borderColor: palette.gold, borderRadius: 13, borderStyle: 'dashed', borderWidth: 2, height: 56, justifyContent: 'center', minWidth: 56 }, patternMissingText: { color: palette.primary, fontSize: 27, fontWeight: '900' },
  patternChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 14 },
  patternChoice: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 17, borderWidth: 1.5, justifyContent: 'center', minHeight: 125, padding: 12, width: '48%' },
  patternChoiceSelected: { backgroundColor: '#E3F8EE', borderColor: palette.primary, borderWidth: 2.5 },
  patternChoiceTile: { alignItems: 'center', backgroundColor: '#E3F8EE', borderRadius: 15, height: 62, justifyContent: 'center', minWidth: 62, paddingHorizontal: 10 },
  patternChoiceGlyph: { color: palette.dark, fontSize: 33, fontWeight: '900' }, patternChoiceColorLabel: { color: '#173F3A', fontSize: 16 },
  patternChoiceLabel: { color: palette.dark, fontSize: 16, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  patternChoiceCheck: { color: palette.primary, fontSize: 17, fontWeight: '900', position: 'absolute', right: 10, top: 8 },
  wordPrompt: { alignItems: 'center', backgroundColor: '#fff4b8', borderColor: palette.gold, borderRadius: 19, borderWidth: 1, marginTop: 12, padding: 17 },
  wordPromptLabel: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, letterRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 13 },
  letterTile: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, height: 54, justifyContent: 'center', margin: 3, minWidth: 46, paddingHorizontal: 8 },
  letterText: { color: palette.dark, fontSize: 27, fontWeight: '900' }, missingLetter: { backgroundColor: palette.primary, borderColor: palette.gold, borderStyle: 'dashed', borderWidth: 2 }, missingLetterText: { color: palette.white }, letterSpace: { width: 10 },
  textInput: { backgroundColor: palette.surface, borderColor: palette.primary, borderRadius: 16, borderWidth: 2, color: palette.dark, fontSize: 23, fontWeight: '800', minHeight: 64, marginTop: 14, paddingHorizontal: 17 },
  answerHelper: { color: palette.muted, fontSize: 14, marginTop: 6 }, answerValidation: { color: palette.error, fontSize: 14, fontWeight: '700', marginTop: 6 },
  options: { marginTop: 8 }, optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 12 }, optionGridStacked: { flexDirection: 'column' },
  answer: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 17, borderWidth: 1.5, flexDirection: 'row', marginTop: 10, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, width: '100%' },
  answerCompact: { alignItems: 'center', flexDirection: 'column', justifyContent: 'center', marginTop: 0, minHeight: 148, padding: 13, width: '48%' },
  oddAnswer: { backgroundColor: '#F6FBFD', borderColor: '#C5DEEA' }, categoryAnswer: { backgroundColor: '#FAF8FD', borderColor: '#D9C9F1' },
  answerStacked: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-start', minHeight: 72, width: '100%' },
  answerSelected: { backgroundColor: '#e3f8ee', borderColor: palette.primary, borderWidth: 2.5 },
  answerNumber: { alignItems: 'center', backgroundColor: '#f4f6f2', borderRadius: 11, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  answerNumberSelected: { backgroundColor: palette.primary }, answerNumberText: { color: palette.muted, fontSize: 14, fontWeight: '900' }, answerNumberTextSelected: { color: palette.white },
  answerText: { color: palette.dark, flex: 1, fontSize: 18, fontWeight: '800', lineHeight: 25 }, answerTextCompact: { flex: 0, fontSize: 17, lineHeight: 23, marginTop: 8 }, answerTextStacked: { flex: 1, marginTop: 0 }, answerTextSelected: { color: palette.primary, fontWeight: '900' },
  optionIllustration: { alignItems: 'center', backgroundColor: '#F1F6F3', borderColor: '#D7E6DE', borderRadius: 15, borderWidth: 1, height: 45, justifyContent: 'center', marginBottom: 7, width: 45 }, optionIllustrationLarge: { borderRadius: 19, height: 68, width: 68 }, optionIllustrationText: { fontSize: 26 }, optionIllustrationTextLarge: { fontSize: 40 },
  textIllustration: { backgroundColor: '#F1F3F1', borderColor: '#D5DAD6' }, textIllustrationLabel: { color: palette.muted, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  selectionMark: { alignItems: 'center', borderColor: '#b8ad9d', borderRadius: 12, borderWidth: 1.5, height: 28, justifyContent: 'center', marginLeft: 10, width: 28 },
  selectionMarkSelected: { backgroundColor: palette.primary, borderColor: palette.primary }, selectionText: { color: palette.white, fontSize: 16, fontWeight: '900' },
  touchHint: { color: palette.muted, fontSize: 14, marginTop: 13, textAlign: 'center' }, voiceBlock: { marginTop: 13 },
  hintButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 9, marginTop: 13, minHeight: 48, paddingHorizontal: 3 },
  hintIcon: { alignItems: 'center', backgroundColor: '#fff4b8', borderRadius: 12, height: 34, justifyContent: 'center', width: 34 }, hintIconText: { color: palette.primary, fontSize: 17, fontWeight: '900' },
  hintButtonText: { color: palette.primary, fontSize: 16, fontWeight: '900' }, hintChevron: { color: palette.primary, fontSize: 22, fontWeight: '700', marginLeft: 3 },
  hintCard: { alignItems: 'flex-start', backgroundColor: '#fff7ed', borderColor: '#f3dcbf', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 4, padding: 14 },
  hintCopy: { flex: 1 }, hintEyebrow: { color: '#985111', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, hintText: { color: palette.dark, fontSize: 16, lineHeight: 23, marginTop: 4 },
  feedback: { alignItems: 'center', backgroundColor: '#e3f8ee', borderColor: '#b8ead6', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 14, padding: 13 },
  feedbackIcon: { alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, height: 34, justifyContent: 'center', width: 34 }, feedbackIconText: { color: palette.primary, fontSize: 16, fontWeight: '900' },
  feedbackText: { color: palette.primary, flex: 1, fontSize: 16, fontWeight: '800', lineHeight: 23 },
  button: { alignItems: 'center', backgroundColor: palette.primary, borderColor: palette.gold, borderRadius: 17, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'center', marginTop: 17, minHeight: 62, paddingHorizontal: 19 },
  buttonText: { color: palette.white, flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'center' }, buttonArrow: { color: '#fff4b8', fontSize: 28, fontWeight: '600', marginLeft: 5 },
  buttonDisabled: { backgroundColor: '#81998c', opacity: 0.8 }, skipButton: { alignItems: 'center', alignSelf: 'center', justifyContent: 'center', marginTop: 8, minHeight: 50, paddingHorizontal: 16 },
  skipButtonText: { color: palette.muted, fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' }, disabledLink: { opacity: 0.5 }, pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  phaseBadge: { alignSelf: 'flex-start', backgroundColor: '#fff4b8', borderColor: palette.gold, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 36, paddingHorizontal: 13, paddingVertical: 8 },
  phaseDot: { alignSelf: 'center', backgroundColor: palette.primary, borderRadius: 5, height: 9, width: 9 }, phaseText: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  helper: { color: palette.muted, fontSize: 17, lineHeight: 25, marginTop: 8 },
  studyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 18 }, studyGridStacked: { flexDirection: 'column' },
  studyItem: { alignItems: 'center', backgroundColor: '#fffdf8', borderColor: palette.border, borderRadius: 17, borderWidth: 1, flexDirection: 'column', gap: 8, justifyContent: 'center', minHeight: 144, padding: 12, width: '48%' },
  studyItemStacked: { width: '100%' }, studyIllustration: { alignItems: 'center', backgroundColor: '#fff4b8', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  studyIllustrationText: { fontSize: 24 }, studyCopy: { alignItems: 'center', minWidth: 0 }, studyNumberText: { color: palette.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, studyWord: { color: palette.dark, flexShrink: 1, fontSize: 16, fontWeight: '900', marginTop: 2, textAlign: 'center' },
  ordered: { alignItems: 'center', backgroundColor: '#e3f8ee', borderColor: '#b8ead6', borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 9, minHeight: 62, padding: 12 },
  orderProgress: { alignItems: 'center', backgroundColor: '#fff4b8', borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, minHeight: 43, paddingHorizontal: 12 }, orderProgressLabel: { color: palette.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 }, orderProgressValue: { color: palette.dark, fontSize: 14, fontWeight: '800' },
  orderNumber: { alignItems: 'center', backgroundColor: palette.primary, borderRadius: 11, height: 38, justifyContent: 'center', marginRight: 9, width: 38 },
  orderIcon: { alignItems: 'center', backgroundColor: '#fff4b8', borderRadius: 11, height: 38, justifyContent: 'center', marginRight: 10, width: 38 }, orderIconText: { fontSize: 21 },
  orderNumberText: { color: palette.white, fontSize: 16, fontWeight: '900' }, orderText: { color: palette.dark, flex: 1, fontSize: 17, fontWeight: '800' },
  resetButton: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8, minHeight: 50, paddingHorizontal: 8 }, resetText: { color: palette.primary, fontSize: 15, fontWeight: '900' },
  completionCard: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: radius.hero, borderWidth: 1.5, marginTop: 4, padding: 21, ...shadows.level2 },
  completionMark: { alignItems: 'center', backgroundColor: '#E3F8EE', borderColor: '#B8EAD6', borderRadius: 27, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  completionCheck: { color: palette.primary, fontSize: 29, fontWeight: '900' }, completionEyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 14 },
  completionTitle: { color: palette.dark, fontSize: 28, fontWeight: '900', marginTop: 4, textAlign: 'center' }, completionSubtitle: { color: palette.muted, fontSize: 16, lineHeight: 23, marginTop: 5, textAlign: 'center' },
  scorePanel: { alignItems: 'stretch', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 18, minHeight: 104, width: '100%' },
  scoreMetric: { alignItems: 'center', flex: 1, justifyContent: 'center' }, scoreMetricCard: { backgroundColor: '#F3F7F4', borderColor: '#DCE9E1', borderRadius: 17, borderWidth: 1, padding: 12 },
  scoreValue: { color: palette.primary, fontSize: 27, fontWeight: '900' }, scoreTotal: { color: palette.muted, fontSize: 17, fontWeight: '700' },
  scoreLabel: { color: palette.muted, fontSize: 14, fontWeight: '800', marginTop: 4, textAlign: 'center' }, skippedLabel: { color: palette.secondary, fontSize: 13, fontWeight: '700', marginTop: 3 },
  completionMessage: { color: palette.muted, fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'center' }, completionActions: { alignSelf: 'stretch', marginTop: 3 },
  secondaryButton: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.gold, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', marginTop: 10, minHeight: 56, paddingHorizontal: 16 },
  secondaryButtonText: { color: palette.primary, fontSize: 16, fontWeight: '900', textAlign: 'center' }, homeButton: { alignItems: 'center', justifyContent: 'center', marginTop: 2, minHeight: 50, paddingHorizontal: 16 },
  homeButtonText: { color: palette.primary, fontSize: 15, fontWeight: '800' },
  statusCard: { alignItems: 'flex-start', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 15, padding: 15 },
  statusError: { backgroundColor: palette.errorTint, borderColor: '#efccd3' }, statusIcon: { alignItems: 'center', backgroundColor: '#e3f8ee', borderRadius: 13, height: 38, justifyContent: 'center', width: 38 },
  statusIconError: { backgroundColor: '#fff1f4' }, statusIconText: { color: palette.primary, fontSize: 18, fontWeight: '900' }, statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: { color: palette.dark, fontSize: 17, fontWeight: '900' }, statusText: { color: palette.muted, fontSize: 15, lineHeight: 21, marginTop: 4 },
});
