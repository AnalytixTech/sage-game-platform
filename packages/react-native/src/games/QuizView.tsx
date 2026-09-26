import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import type { QuizState } from '@sagegames/game-quiz-master';
import { alpha, findEvent, gameAccent, GameViewProps, quizEvents, useGameEvents, useQuiz, useSage } from '@sagegames/react-headless';
import { Chip, FadeSlide, FloatUp, Icon, ProgressBar, Pulse, Shake, Surface, typeStyle, usePressScale } from '../ui/primitives';

function Option({ letter, text, onPress, index, accent, testID }: { letter: string; text: string; onPress: () => void; index: number; accent: string; testID: string }) {
  const { theme } = useSage();
  const press = usePressScale(0.97);
  const c = theme.colors;
  return (
    <FadeSlide from="right" delay={60 * index}>
      <Animated.View style={press.style}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          onPress={onPress}
          {...press.handlers}
          style={({ pressed }) => ({
            backgroundColor: pressed ? alpha(accent, 0.18) : c.surface,
            borderColor: pressed ? accent : c.border,
            borderWidth: 1.5,
            borderRadius: theme.radii.lg,
            paddingVertical: 14,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          })}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: alpha(accent, 0.2), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[typeStyle(theme, theme.typography.caption), { color: accent, fontSize: 14 }]}>{letter}</Text>
          </View>
          <Text style={[typeStyle(theme, theme.typography.body), { color: c.text, fontSize: 16, flex: 1, fontWeight: '600' }]}>{text}</Text>
        </Pressable>
      </Animated.View>
    </FadeSlide>
  );
}

export function QuizView({ state, dispatch, elapsedMs, theme, labels, paused }: GameViewProps<QuizState>) {
  const quiz = useQuiz(state, elapsedMs, dispatch);
  const { events, seq } = useGameEvents(state, quizEvents);
  const c = theme.colors;
  const accent = gameAccent(theme, 'game_quiz_001');
  const lowTime = quiz.remainingMs < 5000 && !!quiz.current;
  const correct = findEvent(events, 'correct');
  const wrong = findEvent(events, 'wrong') ?? findEvent(events, 'timeout');

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Chip label={`${labels.question} ${quiz.questionNumber}/${quiz.total}`} color={accent} />
            {state.streak >= 3 && <Chip label={`×${state.streak}`} tone="warning" icon={<Icon name="fire" size={12} />} />}
          </View>
          <Pulse active={lowTime}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={13} color={lowTime ? c.danger : c.textMuted} />
              <Text style={[typeStyle(theme, theme.typography.caption), { color: lowTime ? c.danger : c.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] }]}>
                {Math.ceil(quiz.remainingMs / 1000)}s
              </Text>
            </View>
          </Pulse>
        </View>
        <ProgressBar fraction={quiz.remainingFraction} color={lowTime ? c.danger : undefined} />
      </View>

      <View>
        {quiz.feedback && (
          <Shake trigger={wrong ? seq : null}>
            <FadeSlide trigger={state.answers.length} from="top" distance={8}>
              <View
                accessibilityLiveRegion="polite"
                style={{
                  backgroundColor: quiz.feedback.correct ? c.success : alpha(c.danger, 0.14),
                  borderColor: quiz.feedback.correct ? c.success : alpha(c.danger, 0.5),
                  borderWidth: 1,
                  borderRadius: theme.radii.md,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name={quiz.feedback.correct ? 'check' : 'cross'} size={15} color={quiz.feedback.correct ? '#ffffff' : c.danger} />
                <Text style={[typeStyle(theme, theme.typography.body), { color: quiz.feedback.correct ? '#ffffff' : c.text, fontSize: 14, fontWeight: '600', flex: 1 }]}>
                  {quiz.feedback.correct
                    ? labels.correct
                    : `${quiz.feedback.timedOut ? `${labels.timeUp}. ` : ''}${labels.wrongAnswerWas}: ${quiz.feedback.correctAnswer}`}
                </Text>
              </View>
            </FadeSlide>
          </Shake>
        )}
        <FloatUp trigger={correct ? seq : null} text={correct ? `+${correct.points}` : ''} style={{ top: -6 }} />
      </View>

      {quiz.current && !paused && (
        <FadeSlide trigger={state.index} from="right" distance={24}>
          <View style={{ gap: theme.spacing.md }}>
            <Surface elevation="sm" gradient={[alpha(accent, 0.22) as string, c.surface]} style={{ borderWidth: 1, borderColor: alpha(accent, 0.35) }}>
              <Text style={[typeStyle(theme, theme.typography.title), { color: c.text, fontSize: 21 }]}>{quiz.current.question}</Text>
            </Surface>
            <View style={{ gap: theme.spacing.sm }}>
              {quiz.current.options.map((option, i) => (
                <Option
                  key={`${state.index}-${i}`}
                  index={i}
                  letter={String.fromCharCode(65 + i)}
                  text={option}
                  accent={accent}
                  testID={`quiz-option-${i}`}
                  onPress={() => quiz.answer(i)}
                />
              ))}
            </View>
          </View>
        </FadeSlide>
      )}
    </View>
  );
}
