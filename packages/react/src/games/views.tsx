import React, { PointerEvent, useEffect, useRef } from 'react';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import type { QuizState } from '@sagegames/game-quiz-master';
import type { SudokuState } from '@sagegames/game-sudoku';
import type { WordRushState } from '@sagegames/game-word-rush';
import type { WordSearchState } from '@sagegames/game-word-search';
import {
  formatClock,
  GameViewProps,
  GridCell,
  useMemoryBoard,
  useQuiz,
  useSudoku,
  useWordRush,
  useWordSearch,
} from '@sagegames/react-headless';
import { Body, Button, font, ProgressBar, row, stack, Stat } from '../ui';

const BOARD_MAX = 460;
const FOUND_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a7f3d0', '#c7d2fe'];

/** Grid cell under a pointer, from the element's bounding box. */
function cellFromPointer(e: PointerEvent<HTMLElement>, n: number, gapPx = 0): { row: number; col: number; nearCenter: boolean } | null {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = (rect.width - gapPx * (n - 1)) / n;
  const pitch = size + gapPx;
  const col = Math.floor(x / pitch);
  const rowIdx = Math.floor(y / pitch);
  if (rowIdx < 0 || col < 0 || rowIdx >= n || col >= n) return null;
  const dx = x - (col * pitch + size / 2);
  const dy = y - (rowIdx * pitch + size / 2);
  return { row: rowIdx, col, nearCenter: Math.hypot(dx, dy) <= size * 0.42 };
}

// ---------------------------------------------------------------- Quiz

export function QuizView({ state, dispatch, elapsedMs, theme, labels, paused }: GameViewProps<QuizState>) {
  const quiz = useQuiz(state, elapsedMs, dispatch);
  const c = theme.colors;
  const lowTime = quiz.remainingMs < 5000;
  return (
    <div style={stack(theme.spacing.lg)}>
      <div style={stack(theme.spacing.sm)}>
        <div style={row(0, { justifyContent: 'space-between', fontSize: 13 })}>
          <span style={{ color: c.textMuted, ...font(theme, 'medium') }}>
            {labels.question} {quiz.questionNumber}/{quiz.total}
          </span>
          <span style={{ color: lowTime ? c.danger : c.textMuted, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>
            {Math.ceil(quiz.remainingMs / 1000)}s
          </span>
        </div>
        <ProgressBar fraction={quiz.remainingFraction} color={lowTime ? c.danger : c.primary} />
      </div>

      {quiz.feedback && (
        <div
          role="status"
          style={{
            background: quiz.feedback.correct ? c.success : c.surfaceAlt,
            color: quiz.feedback.correct ? '#fff' : c.text,
            borderRadius: theme.radii.md,
            padding: '10px 14px',
            fontSize: 14,
            ...font(theme, 'medium'),
          }}
        >
          {quiz.feedback.correct
            ? labels.correct
            : `${quiz.feedback.timedOut ? `${labels.timeUp}. ` : ''}${labels.wrongAnswerWas}: ${quiz.feedback.correctAnswer}`}
        </div>
      )}

      {quiz.current && !paused && (
        <>
          <div style={{ color: c.text, fontSize: 20, lineHeight: 1.4, ...font(theme, 'bold') }}>{quiz.current.question}</div>
          <div style={stack(theme.spacing.sm)}>
            {quiz.current.options.map((option, i) => (
              <button
                key={`${state.index}-${i}`}
                type="button"
                data-testid={`quiz-option-${i}`}
                onClick={() => quiz.answer(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  background: c.surface,
                  color: c.text,
                  border: `1.5px solid ${c.border}`,
                  borderRadius: theme.radii.md,
                  padding: '14px 16px',
                  fontSize: 16,
                  ...font(theme, 'medium'),
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: c.surfaceAlt,
                    color: c.textMuted,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    flex: 'none',
                    ...font(theme, 'bold'),
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Memory

export function MemoryView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<MemoryMatchState>) {
  const board = useMemoryBoard(state, elapsedMs, dispatch);
  const c = theme.colors;
  return (
    <div style={stack(theme.spacing.lg, { alignItems: 'center' })}>
      <div style={row(0, { justifyContent: 'space-around', alignSelf: 'stretch' })}>
        <Stat label={labels.pairs} value={`${state.matchedPairs}/${state.pairCount}`} align="center" />
        <Stat label={labels.moves} value={state.moves} align="center" />
      </div>
      <div style={{ width: '100%', maxWidth: BOARD_MAX, display: 'grid', gridTemplateColumns: `repeat(${board.columns}, 1fr)`, gap: theme.spacing.sm }}>
        {state.cards.map((card, i) => {
          const up = board.isFaceUp(i) && !paused;
          const mismatch = board.isMismatch(i);
          return (
            <button
              key={i}
              type="button"
              data-testid={`memory-card-${i}`}
              aria-label={up ? card.face : 'Hidden card'}
              disabled={paused || ended || up}
              onClick={() => board.flip(i)}
              className="sg-card-face"
              style={{
                aspectRatio: '5 / 6',
                borderRadius: theme.radii.md,
                border: `1.5px solid ${up ? (mismatch ? c.danger : c.border) : c.primary}`,
                background: !up ? c.primary : card.matched ? c.highlight : mismatch ? c.cellConflict : c.surface,
                color: c.onPrimary,
                fontSize: 'clamp(24px, 9vw, 44px)',
                transform: up ? 'rotateY(0deg)' : 'rotateY(180deg)',
                opacity: 1,
              }}
            >
              <span style={{ display: 'inline-block', transform: up ? undefined : 'rotateY(180deg)', ...(up ? {} : { opacity: 0.6, fontSize: '0.65em', ...font(theme, 'bold') }) }}>
                {up ? card.face : '?'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sudoku

export function SudokuView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<SudokuState>) {
  const sudoku = useSudoku(state, dispatch);
  const c = theme.colors;
  const n = sudoku.size;
  const noteColumns = Math.ceil(Math.sqrt(n));
  const gridRef = useRef<HTMLDivElement>(null);

  // Keyboard: arrows move, digits enter, Backspace/Delete/0 erase, N toggles notes.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (paused || ended) return;
      const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[e.key]) {
        sudoku.move(...arrows[e.key]);
        e.preventDefault();
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) {
        sudoku.input(Number(e.key));
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        sudoku.erase();
      } else if (e.key.toLowerCase() === 'n') {
        sudoku.toggleNotes();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  });

  const padColumns = n <= 6 ? n : Math.ceil(n / 2);

  return (
    <div style={stack(theme.spacing.md, { alignItems: 'center' })}>
      <div style={row(0, { justifyContent: 'space-around', alignSelf: 'stretch' })}>
        <Stat label={labels.mistakes} value={state.mistakes} align="center" />
        <Stat label={labels.hints} value={state.hintsUsed} align="center" />
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label="Sudoku board"
        style={{ width: '100%', maxWidth: BOARD_MAX, display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, background: c.border, outline: 'none' }}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const info = sudoku.cell(i);
          const bg = info.selected ? c.cellSelected : info.wrong ? c.cellConflict : info.sameValue ? c.cellSelected : info.peer ? c.cellPeer : c.surface;
          const edge = (thick: boolean) => `${thick ? 2 : 0.5}px solid ${thick ? c.text : c.border}`;
          return (
            <div
              key={i}
              role="gridcell"
              data-testid={`sudoku-cell-${i}`}
              aria-label={`Row ${Math.floor(i / n) + 1} column ${(i % n) + 1}${info.value ? `, ${info.value}` : ', empty'}`}
              aria-selected={info.selected}
              onClick={() => {
                sudoku.select(i);
                gridRef.current?.focus();
              }}
              style={{
                aspectRatio: '1',
                background: bg,
                borderTop: edge(info.borders.top),
                borderLeft: edge(info.borders.left),
                borderRight: edge(info.borders.right),
                borderBottom: edge(info.borders.bottom),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {paused ? null : info.value !== 0 ? (
                <span
                  style={{
                    fontSize: `clamp(14px, ${50 / n}vw, ${Math.round((BOARD_MAX / n) * 0.52)}px)`,
                    color: info.wrong ? c.danger : info.given ? c.text : c.primary,
                    fontVariantNumeric: 'tabular-nums',
                    ...font(theme, info.given ? 'bold' : 'medium'),
                  }}
                >
                  {info.value}
                </span>
              ) : info.notes.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${noteColumns}, 1fr)`, width: '90%', fontSize: `clamp(8px, ${14 / n}vw, 12px)`, color: c.textMuted, textAlign: 'center', lineHeight: 1.1 }}>
                  {Array.from({ length: n }, (_, d) => (
                    <span key={d}>{info.notes.includes(d + 1) ? d + 1 : ' '}</span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ width: '100%', maxWidth: BOARD_MAX, display: 'grid', gridTemplateColumns: `repeat(${padColumns}, 1fr)`, gap: 6 }}>
        {Array.from({ length: n }, (_, d) => {
          const digit = d + 1;
          const done = sudoku.digitCounts[digit] >= n;
          return (
            <button
              key={digit}
              type="button"
              aria-label={`${sudoku.notesMode ? 'Note' : 'Enter'} ${digit}`}
              disabled={paused || ended || done}
              onClick={() => sudoku.input(digit)}
              style={{
                height: 52,
                borderRadius: theme.radii.md,
                border: 'none',
                background: c.surfaceAlt,
                color: sudoku.notesMode ? c.textMuted : c.text,
                fontSize: 22,
                opacity: done ? 0.35 : 1,
                ...font(theme, 'bold'),
              }}
            >
              {digit}
            </button>
          );
        })}
      </div>

      <div style={row(theme.spacing.sm, { width: '100%', maxWidth: BOARD_MAX })}>
        <Button compact variant={sudoku.notesMode ? 'primary' : 'ghost'} label={`${labels.notes}: ${sudoku.notesMode ? 'on' : 'off'}`} onClick={sudoku.toggleNotes} style={{ flex: 1 }} />
        <Button compact variant="ghost" label={labels.erase} onClick={sudoku.erase} disabled={paused || ended} style={{ flex: 1 }} />
        <Button compact variant="ghost" label={labels.hint} onClick={sudoku.hint} disabled={paused || ended} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Word search

export function WordSearchView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<WordSearchState>) {
  const ws = useWordSearch(state, dispatch);
  const c = theme.colors;
  const n = state.size;
  const disabled = paused || ended;
  const toCell = (e: PointerEvent<HTMLDivElement>): GridCell | null => {
    const hit = cellFromPointer(e, n);
    return hit ? [hit.row, hit.col] : null;
  };

  return (
    <div style={stack(theme.spacing.md, { alignItems: 'center' })}>
      <Stat label={labels.found} value={`${state.foundCount}/${state.words.length}`} align="center" />
      <div
        data-testid="word-search-grid"
        aria-label={`${state.categoryName} word search grid`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const cell = toCell(e);
          if (cell) ws.pointerDown(cell);
        }}
        onPointerMove={(e) => {
          const cell = toCell(e);
          if (cell) ws.pointerMove(cell);
        }}
        onPointerUp={(e) => ws.pointerUp(toCell(e))}
        onPointerCancel={ws.cancel}
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          background: c.surface,
          borderRadius: theme.radii.md,
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {state.grid.flatMap((letters, r) =>
          letters.map((letter, col) => {
            const i = r * n + col;
            const found = ws.foundCells.get(i);
            const selecting = ws.preview.has(i);
            return (
              <div
                key={i}
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: selecting ? c.cellSelected : found !== undefined ? FOUND_COLORS[found % FOUND_COLORS.length] : 'transparent',
                  color: found !== undefined && !selecting ? '#1f2937' : c.text,
                  fontSize: `clamp(12px, ${50 / n}vw, ${Math.round((480 / n) * 0.5)}px)`,
                  ...font(theme, selecting ? 'bold' : 'medium'),
                }}
              >
                {paused ? '' : letter}
              </div>
            );
          })
        )}
      </div>
      <Body muted center style={{ fontSize: 13 }}>
        Drag across a word, or click its first and last letters.
      </Body>
      <div style={row(8, { flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 })}>
        {state.words.map((w, i) => (
          <span
            key={w.token}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: w.found ? FOUND_COLORS[i % FOUND_COLORS.length] : c.surfaceAlt,
              color: w.found ? '#1f2937' : c.text,
              textDecoration: w.found ? 'line-through' : 'none',
              fontSize: 14,
              ...font(theme, 'medium'),
            }}
          >
            {w.display}
          </span>
        ))}
      </div>
      {state.skippedWords.length > 0 && (
        <Body muted center style={{ fontSize: 12 }}>
          {labels.skippedWords}: {state.skippedWords.join(', ')}
        </Body>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Word rush

export function WordRushView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<WordRushState>) {
  const rush = useWordRush(state, elapsedMs, dispatch);
  const c = theme.colors;
  const n = state.size;
  const GAP = 8;
  const drag = useRef<{ start: number | null; dragging: boolean }>({ start: null, dragging: false });
  const disabled = paused || ended;
  const lowTime = rush.remainingMs < 10_000;
  const reasons: Record<string, string> = {
    not_adjacent: labels.notAdjacent,
    too_short: labels.tooShort,
    not_a_word: labels.notAWord,
    already_found: labels.alreadyFound,
  };
  const last = state.last;

  return (
    <div style={stack(theme.spacing.md, { alignItems: 'center' })}>
      <div style={stack(theme.spacing.sm, { alignSelf: 'stretch' })}>
        <div style={row(0, { justifyContent: 'space-between' })}>
          <Stat label={labels.words} value={state.found.length} />
          <Stat label={labels.time} value={formatClock(rush.remainingMs)} align="right" />
        </div>
        <ProgressBar fraction={rush.remainingMs / state.durationMs} color={lowTime ? c.danger : c.primary} />
      </div>

      <div
        role="status"
        style={{
          minHeight: 48,
          alignSelf: 'stretch',
          borderRadius: theme.radii.md,
          background: c.surfaceAlt,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
        }}
      >
        {rush.word ? (
          <span style={{ color: c.text, fontSize: 24, letterSpacing: 3, ...font(theme, 'bold') }}>{rush.word}</span>
        ) : last ? (
          <span style={{ color: last.rejected ? c.danger : c.success, fontSize: 15, ...font(theme, 'medium') }}>
            {last.rejected ? `${last.word ? `${last.word.toUpperCase()}: ` : ''}${reasons[last.rejected]}` : `${last.word.toUpperCase()} +${last.points}`}
          </span>
        ) : (
          <span style={{ color: c.textMuted, fontSize: 14 }}>Drag through touching letters, or click them</span>
        )}
      </div>

      <div
        data-testid="word-rush-grid"
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const hit = cellFromPointer(e, n, GAP);
          const t = hit ? hit.row * n + hit.col : null;
          drag.current = { start: t, dragging: false };
          if (t !== null) rush.tap(t);
        }}
        onPointerMove={(e) => {
          const { start } = drag.current;
          const hit = cellFromPointer(e, n, GAP);
          if (start === null || !hit || !hit.nearCenter) return;
          const t = hit.row * n + hit.col;
          if (!drag.current.dragging && t !== start) {
            drag.current.dragging = true;
            rush.beginPath(start);
          }
          if (drag.current.dragging) rush.extendTo(t);
        }}
        onPointerUp={() => {
          if (drag.current.dragging) rush.submit();
          drag.current = { start: null, dragging: false };
        }}
        style={{ width: '100%', maxWidth: 400, display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: GAP, touchAction: 'none', userSelect: 'none' }}
      >
        {state.grid.map((face, i) => {
          const inPath = rush.path.includes(i);
          const isLast = rush.path[rush.path.length - 1] === i;
          return (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                borderRadius: theme.radii.md,
                background: inPath ? c.primary : c.surface,
                border: `${isLast ? 3 : 1.5}px solid ${inPath ? c.primary : c.border}`,
                color: inPath ? c.onPrimary : c.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: face.length > 1 ? 'clamp(16px, 7vw, 30px)' : 'clamp(20px, 9vw, 40px)',
                cursor: 'pointer',
                ...font(theme, 'bold'),
              }}
            >
              {paused ? '' : face === 'QU' ? 'Qu' : face}
            </div>
          );
        })}
      </div>

      <div style={row(theme.spacing.sm, { width: '100%', maxWidth: 400 })}>
        <Button variant="ghost" label={labels.clear} onClick={rush.clear} disabled={!rush.path.length} style={{ flex: 1 }} />
        <Button label={labels.submitWord} onClick={rush.submit} disabled={!rush.canSubmit || disabled} style={{ flex: 2 }} />
      </div>

      {state.found.length > 0 && (
        <div style={row(6, { flexWrap: 'wrap', alignSelf: 'stretch' })}>
          {state.found
            .slice()
            .reverse()
            .map((w) => (
              <span key={w} style={{ padding: '5px 10px', borderRadius: 999, background: c.surfaceAlt, color: c.text, fontSize: 13, ...font(theme, 'medium') }}>
                {w.toUpperCase()}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
