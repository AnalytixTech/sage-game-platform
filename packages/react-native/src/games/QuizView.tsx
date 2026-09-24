import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { QuizState } from '@sagegames/game-quiz-master';
import { GameViewProps, useQuiz } from '@sagegames/react-headless';
import { font, ProgressBar } from '../ui/primitives';

export function QuizView({ state, dispatch, elapsedMs, theme, labels, paused }: GameViewProps<QuizState>) {
  const quiz = useQuiz(state, elapsedMs, dispatch);
  const c = theme.colors;
  const lowTime = quiz.remainingMs < 5000;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[{ color: c.textMuted, fontSize: 13 }, font(theme, 'medium')]}>
            {labels.question} {quiz.questionNumber}/{quiz.total}
          </Text>
          <Text style={[{ color: lowTime ? c.danger : c.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>
            {Math.ceil(quiz.remainingMs / 1000)}s
          </Text>
        </View>
        <ProgressBar fraction={quiz.remainingFraction} color={lowTime ? c.danger : c.primary} />
      </View>

      {quiz.feedback && (
        <View
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: quiz.feedback.correct ? c.success : c.surfaceAlt,
            borderRadius: theme.radii.md,
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <Text style={[{ color: quiz.feedback.correct ? '#ffffff' : c.text, fontSize: 14 }, font(theme, 'medium')]}>
            {quiz.feedback.correct
              ? labels.correct
              : `${quiz.feedback.timedOut ? `${labels.timeUp}. ` : ''}${labels.wrongAnswerWas}: ${quiz.feedback.correctAnswer}`}
          </Text>
        </View>
      )}

      {quiz.current && !paused && (
        <>
          <Text style={[{ color: c.text, fontSize: 20, lineHeight: 28 }, font(theme, 'bold')]}>{quiz.current.question}</Text>
          <View style={{ gap: theme.spacing.sm }}>
            {quiz.current.options.map((option, i) => (
              <Pressable
                key={`${state.index}-${i}`}
                testID={`quiz-option-${i}`}
                accessibilityRole="button"
                onPress={() => quiz.answer(i)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? c.surfaceAlt : c.surface,
                  borderColor: pressed ? c.primary : c.border,
                  borderWidth: 1.5,
                  borderRadius: theme.radii.md,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                })}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: c.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={[{ color: c.textMuted, fontSize: 13 }, font(theme, 'bold')]}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={[{ color: c.text, fontSize: 16, flex: 1 }, font(theme, 'medium')]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
