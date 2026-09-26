import React, { PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import type { QuizState } from '@sagegames/game-quiz-master';
import type { SudokuState } from '@sagegames/game-sudoku';
import type { WordRushState } from '@sagegames/game-word-rush';
import type { WordSearchState } from '@sagegames/game-word-search';
import {
  alpha,
  findEvent,
  formatClock,
  gameAccent,
  GameEvent,
  GameViewProps,
  GridCell,
  memoryEvents,
  quizEvents,
  sudokuEvents,
  useGameEvents,
  useMemoryBoard,
  useQuiz,
  useSudoku,
  useWordRush,
  useWordSearch,
  wordRushEvents,
  wordSearchEvents,
} from '@sagegames/react-headless';
import { Body, Button, Chip, FadeSlide, FloatUp, font, gradientCss, Icon, Pop, ProgressBar, Pulse, row, shadowCss, Shake, stack, Stat, Surface, typeStyle, useMotion } from '../ui';

const BOARD_MAX = 460;

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

/** Rendered width of an element, kept up to date. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ---------------------------------------------------------------- Quiz

export function QuizView({ state, dispatch, elapsedMs, theme, labels, paused }: GameViewProps<QuizState>) {
  const quiz = useQuiz(state, elapsedMs, dispatch);
  const { events, seq } = useGameEvents(state, quizEvents);
  const c = theme.colors;
  const accent = gameAccent(theme, 'game_quiz_001');
  const lowTime = quiz.remainingMs < 5000 && !!quiz.current;
  const correct = findEvent(events, 'correct');
  const wrong = findEvent(events, 'wrong') ?? findEvent(events, 'timeout');

  return (
    <div style={stack(theme.spacing.lg)}>
      <div style={stack(theme.spacing.sm)}>
        <div style={row(8, { justifyContent: 'space-between', alignItems: 'center' })}>
          <div style={row(8, { alignItems: 'center' })}>
            <Chip label={`${labels.question} ${quiz.questionNumber}/${quiz.total}`} color={accent} />
            {state.streak >= 3 && <Chip label={`×${state.streak}`} tone="warning" icon={<Icon name="fire" size={12} />} />}
          </div>
          <Pulse active={lowTime}>
            <span style={{ ...row(4, { alignItems: 'center' }), color: lowTime ? c.danger : c.textMuted, fontVariantNumeric: 'tabular-nums', ...typeStyle(theme, theme.typography.caption), fontSize: 14 }}>
              <Icon name="clock" size={14} color={lowTime ? c.danger : c.textMuted} />
              {Math.ceil(quiz.remainingMs / 1000)}s
            </span>
          </Pulse>
        </div>
        <ProgressBar fraction={quiz.remainingFraction} color={lowTime ? c.danger : undefined} />
      </div>

      <div style={{ position: 'relative' }}>
        {quiz.feedback && (
          <Shake trigger={wrong ? seq : null}>
            <FadeSlide trigger={state.answers.length} from="top">
              <div
                role="status"
                style={{
                  ...row(8, { alignItems: 'center' }),
                  background: quiz.feedback.correct ? c.success : alpha(c.danger, 0.14),
                  border: `1px solid ${quiz.feedback.correct ? c.success : alpha(c.danger, 0.5)}`,
                  color: quiz.feedback.correct ? '#fff' : c.text,
                  borderRadius: theme.radii.md,
                  padding: '10px 14px',
                  fontSize: 14,
                  ...font(theme, 'medium'),
                }}
              >
                <Icon name={quiz.feedback.correct ? 'check' : 'cross'} size={16} color={quiz.feedback.correct ? '#fff' : c.danger} />
                {quiz.feedback.correct
                  ? labels.correct
                  : `${quiz.feedback.timedOut ? `${labels.timeUp}. ` : ''}${labels.wrongAnswerWas}: ${quiz.feedback.correctAnswer}`}
              </div>
            </FadeSlide>
          </Shake>
        )}
        <FloatUp trigger={correct ? seq : null} text={correct ? `+${correct.points}` : ''} style={{ top: -10 }} />
      </div>

      {quiz.current && !paused && (
        <FadeSlide trigger={state.index} from="right">
          <div style={stack(theme.spacing.md)}>
            <Surface elevation="sm" gradient={[alpha(accent, 0.22), c.surface]} style={{ border: `1px solid ${alpha(accent, 0.35)}` }}>
              <div style={{ color: c.text, ...typeStyle(theme, theme.typography.title), fontSize: 21 }}>{quiz.current.question}</div>
            </Surface>
            <div style={stack(theme.spacing.sm)}>
              {quiz.current.options.map((option, i) => (
                <FadeSlide key={`${state.index}-${i}`} from="right" delay={60 * i}>
                  <button
                    type="button"
                    className="sg-press"
                    data-testid={`quiz-option-${i}`}
                    onClick={() => quiz.answer(i)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      gap: 12,
                      textAlign: 'left',
                      background: c.surface,
                      color: c.text,
                      border: `1.5px solid ${c.border}`,
                      borderRadius: theme.radii.lg,
                      padding: '14px',
                      fontSize: 16,
                      ...font(theme, 'medium'),
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.border)}
                  >
                    <span
                      aria-hidden
                      style={{ width: 32, height: 32, borderRadius: 10, background: alpha(accent, 0.2), color: accent, display: 'inline-grid', placeItems: 'center', fontSize: 14, flex: 'none', ...font(theme, 'bold') }}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    {option}
                  </button>
                </FadeSlide>
              ))}
            </div>
          </div>
        </FadeSlide>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Memory

export function MemoryView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<MemoryMatchState>) {
  const board = useMemoryBoard(state, elapsedMs, dispatch);
  const { events, seq } = useGameEvents(state, memoryEvents);
  const motion = useMotion();
  const c = theme.colors;
  const accent = gameAccent(theme, 'game_memory_001');
  const match = findEvent(events, 'match');
  const miss = findEvent(events, 'miss');
  const flipMs = motion.reduced ? 0 : Math.max(200, motion.ms('base') + 80);

  return (
    <div style={stack(theme.spacing.lg, { alignItems: 'center' })}>
      <div style={row(0, { justifyContent: 'space-around', alignSelf: 'stretch' })}>
        <Stat label={labels.pairs} value={`${state.matchedPairs}/${state.pairCount}`} align="center" icon="star" />
        <Stat label={labels.moves} value={state.moves} align="center" />
      </div>
      <div style={{ position: 'relative', width: '100%', maxWidth: BOARD_MAX }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${board.columns}, 1fr)`, gap: theme.spacing.sm }}>
          {state.cards.map((card, i) => {
            const up = board.isFaceUp(i) && !paused;
            const mismatch = board.isMismatch(i);
            return (
              <Shake key={i} trigger={miss?.cells.includes(i) ? seq : null}>
                <Pop trigger={match?.cells.includes(i) ? seq : null}>
                  <button
                    type="button"
                    data-testid={`memory-card-${i}`}
                    aria-label={up ? card.face : 'Hidden card'}
                    disabled={paused || ended || up}
                    onClick={() => board.flip(i)}
                    className="sg-press"
                    // An explicit colour: browsers grey out disabled buttons, and colour emoji inherit that alpha.
                    style={{ display: 'block', width: '100%', aspectRatio: '5 / 6', padding: 0, border: 'none', background: 'none', color: c.text, perspective: 800, cursor: up ? 'default' : 'pointer' }}
                  >
                    <span
                      style={{
                        position: 'relative',
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        transformStyle: 'preserve-3d',
                        transition: `transform ${flipMs}ms cubic-bezier(.3,1.4,.5,1)`,
                        transform: up ? 'rotateY(180deg)' : 'none',
                      }}
                    >
                      {/* Back */}
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backfaceVisibility: 'hidden',
                          borderRadius: theme.radii.md,
                          background: gradientCss([accent, c.primaryAlt]),
                          boxShadow: shadowCss(theme, 'md'),
                          padding: 5,
                          display: 'block',
                        }}
                      >
                        <span style={{ display: 'grid', placeItems: 'center', height: '100%', borderRadius: Math.max(4, theme.radii.md - 4), border: '1.5px solid rgba(255,255,255,.28)', color: 'rgba(255,255,255,.85)', fontSize: 'clamp(16px, 6vw, 28px)' }}>
                          ✦
                        </span>
                      </span>
                      {/* Face */}
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                          borderRadius: theme.radii.md,
                          display: 'grid',
                          placeItems: 'center',
                          border: `2px solid ${card.matched ? c.success : mismatch ? c.danger : c.border}`,
                          background: card.matched ? alpha(c.success, 0.16) : mismatch ? c.cellConflict : c.surfaceRaised,
                          boxShadow: shadowCss(theme, 'sm'),
                          fontSize: 'clamp(26px, 10vw, 48px)',
                        }}
                      >
                        {up ? card.face : ''}
                        {card.matched && (
                          <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, background: c.success, display: 'grid', placeItems: 'center' }}>
                            <Icon name="check" size={11} color="#fff" />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </Pop>
              </Shake>
            );
          })}
        </div>
        <FloatUp trigger={match ? seq : null} text={match ? `+${match.points}` : ''} style={{ top: '40%' }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sudoku

export function SudokuView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<SudokuState>) {
  const sudoku = useSudoku(state, dispatch);
  const { events, seq } = useGameEvents(state, sudokuEvents);
  const motion = useMotion();
  const c = theme.colors;
  const n = sudoku.size;
  const noteColumns = Math.ceil(Math.sqrt(n));
  const gridRef = useRef<HTMLDivElement>(null);
  const regionLine = alpha(c.text, 0.4);

  const popped = new Set<number>();
  const shaken = new Set<number>();
  const sweep = new Map<number, number>();
  events.forEach((e: GameEvent) => {
    if (e.kind === 'placed' || e.kind === 'hint') popped.add(e.cell);
    if (e.kind === 'mistake') shaken.add(e.cell);
    if (e.kind === 'unitComplete') e.cells.forEach((cell, order) => sweep.set(cell, Math.min(sweep.get(cell) ?? Infinity, order)));
  });

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
        <Stat label={labels.mistakes} value={state.mistakes} align="center" icon="cross" />
        <Stat label={labels.hints} value={state.hintsUsed} align="center" icon="bulb" />
      </div>

      <div style={{ width: '100%', maxWidth: BOARD_MAX, padding: 2, borderRadius: theme.radii.md, background: regionLine, boxShadow: shadowCss(theme, 'md') }}>
        <div
          ref={gridRef}
          tabIndex={0}
          role="grid"
          aria-label="Sudoku board"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, background: c.border, outline: 'none', borderRadius: Math.max(2, theme.radii.md - 2), overflow: 'hidden' }}
        >
          {Array.from({ length: n * n }, (_, i) => {
            const info = sudoku.cell(i);
            const bg = info.selected ? c.cellSelected : info.wrong ? c.cellConflict : info.sameValue ? alpha(c.primary, 0.22) : info.peer ? c.cellPeer : c.surface;
            const edge = (thick: boolean) => `${thick ? 2 : 0.5}px solid ${thick ? regionLine : c.border}`;
            const swept = sweep.has(i);
            return (
              <Shake key={i} trigger={shaken.has(i) ? seq : null} style={{ position: 'relative' }}>
                <div
                  role="gridcell"
                  data-testid={`sudoku-cell-${i}`}
                  aria-label={`Row ${Math.floor(i / n) + 1} column ${(i % n) + 1}${info.value ? `, ${info.value}` : ', empty'}`}
                  aria-selected={info.selected}
                  onClick={() => {
                    sudoku.select(i);
                    gridRef.current?.focus();
                  }}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    background: bg,
                    borderTop: edge(info.borders.top),
                    borderLeft: edge(info.borders.left),
                    borderRight: edge(info.borders.right),
                    borderBottom: edge(info.borders.bottom),
                    boxShadow: info.selected ? `inset 0 0 0 2px ${c.primary}` : undefined,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background-color 160ms',
                  }}
                >
                  {swept && !motion.reduced && (
                    <span
                      key={seq}
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: alpha(c.success, 0.55),
                        opacity: 0,
                        animation: `sg-flash 640ms ease-out ${(sweep.get(i) ?? 0) * 45}ms both`,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {paused ? null : info.value !== 0 ? (
                    <Pop trigger={popped.has(i) ? seq : null} inline>
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
                    </Pop>
                  ) : info.notes.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${noteColumns}, 1fr)`, width: '90%', fontSize: `clamp(8px, ${14 / n}vw, 12px)`, color: c.textMuted, textAlign: 'center', lineHeight: 1.1 }}>
                      {Array.from({ length: n }, (_, d) => (
                        <span key={d}>{info.notes.includes(d + 1) ? d + 1 : ' '}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Shake>
            );
          })}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: BOARD_MAX, display: 'grid', gridTemplateColumns: `repeat(${padColumns}, 1fr)`, gap: 8 }}>
        {Array.from({ length: n }, (_, d) => {
          const digit = d + 1;
          const left = Math.max(0, n - sudoku.digitCounts[digit]);
          const done = left === 0;
          return (
            <button
              key={digit}
              type="button"
              className="sg-press"
              aria-label={`${sudoku.notesMode ? 'Note' : 'Enter'} ${digit}`}
              disabled={paused || ended || done}
              onClick={() => sudoku.input(digit)}
              style={{
                height: 56,
                borderRadius: theme.radii.md,
                border: `1px solid ${c.border}`,
                background: c.surfaceAlt,
                boxShadow: shadowCss(theme, 'sm'),
                color: sudoku.notesMode ? c.textMuted : c.text,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1.05,
                opacity: done ? 0.35 : 1,
                ...font(theme, 'bold'),
              }}
            >
              <span style={{ fontSize: 22 }}>{digit}</span>
              <span style={{ fontSize: 10, color: c.textMuted, ...font(theme, 'medium') }}>{done ? '✓' : left}</span>
            </button>
          );
        })}
      </div>

      <div style={row(theme.spacing.sm, { width: '100%', maxWidth: BOARD_MAX })}>
        <Button
          compact
          icon="pencil"
          variant={sudoku.notesMode ? 'primary' : 'ghost'}
          label={labels.notes}
          ariaLabel={`${labels.notes}: ${sudoku.notesMode ? 'on' : 'off'}`}
          onClick={sudoku.toggleNotes}
          style={{ flex: 1 }}
        />
        <Button compact icon="erase" variant="ghost" label={labels.erase} onClick={sudoku.erase} disabled={paused || ended} style={{ flex: 1 }} />
        <Button compact icon="bulb" variant="ghost" label={labels.hint} onClick={sudoku.hint} disabled={paused || ended} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Word search

export function WordSearchView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<WordSearchState>) {
  const ws = useWordSearch(state, dispatch);
  const { events, seq } = useGameEvents(state, wordSearchEvents);
  const c = theme.colors;
  const n = state.size;
  const palette = c.foundPalette.length ? c.foundPalette : ['#fde68a'];
  const disabled = paused || ended;
  const found = findEvent(events, 'wordFound');
  const preview = [...ws.preview];
  const toCell = (e: PointerEvent<HTMLDivElement>): GridCell | null => {
    const hit = cellFromPointer(e, n);
    return hit ? [hit.row, hit.col] : null;
  };
  const point = (i: number) => ({ x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5 });
  const capsule = (from: number, to: number, key: string, color: string, stroke?: string, grow?: boolean) => {
    const a = point(from);
    const b = point(to);
    return (
      <g key={key} style={grow ? { transformOrigin: `${(a.x + b.x) / 2}px ${(a.y + b.y) / 2}px`, animation: 'sg-pop 420ms cubic-bezier(.2,.8,.3,1.2)' } : undefined}>
        {stroke && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={0.84} strokeLinecap="round" />}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={stroke ? 0.74 : 0.8} strokeLinecap="round" />
      </g>
    );
  };

  return (
    <div style={stack(theme.spacing.md, { alignItems: 'center' })}>
      <Stat label={labels.found} value={`${state.foundCount}/${state.words.length}`} align="center" icon="star" />
      <Shake trigger={findEvent(events, 'noWord') ? seq : null} style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ position: 'relative', padding: 6, background: c.surface, border: `1px solid ${c.border}`, borderRadius: theme.radii.lg, boxShadow: shadowCss(theme, 'md') }}>
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
            style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, touchAction: 'none', userSelect: 'none' }}
          >
            {!paused && (
              <svg aria-hidden viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                {state.words.map((w, i) =>
                  w.found && w.cells.length ? capsule(w.cells[0], w.cells[w.cells.length - 1], w.token, alpha(palette[i % palette.length], 0.92), undefined, found?.word === i) : null
                )}
                {preview.length > 0 && capsule(preview[0], preview[preview.length - 1], 'preview', alpha(c.primary, 0.35), c.primary)}
              </svg>
            )}
            {state.grid.flatMap((letters, r) =>
              letters.map((letter, col) => {
                const i = r * n + col;
                const inFound = ws.foundCells.has(i);
                const selecting = ws.preview.has(i);
                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      aspectRatio: '1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: inFound && !selecting ? '#1f2937' : c.text,
                      fontSize: `clamp(12px, ${48 / n}vw, ${Math.round((480 / n) * 0.48)}px)`,
                      ...font(theme, selecting || inFound ? 'bold' : 'medium'),
                    }}
                  >
                    {paused ? '' : letter}
                  </div>
                );
              })
            )}
          </div>
          <FloatUp trigger={found ? seq : null} text={found ? `+${found.points}` : ''} style={{ top: '45%' }} />
        </div>
      </Shake>
      <Body muted center style={{ fontSize: 13 }}>
        Drag across a word, or click its first and last letters.
      </Body>
      <div style={row(8, { flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 })}>
        {state.words.map((w, i) => (
          <Pop key={w.token} trigger={found?.word === i ? seq : null} inline>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: theme.radii.pill,
                background: w.found ? palette[i % palette.length] : c.surfaceAlt,
                border: `1px solid ${w.found ? 'transparent' : c.border}`,
                color: w.found ? '#1f2937' : c.text,
                textDecoration: w.found ? 'line-through' : 'none',
                fontSize: 14,
                ...font(theme, 'medium'),
              }}
            >
              {w.display}
            </span>
          </Pop>
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
  const { events, seq } = useGameEvents(state, wordRushEvents);
  const c = theme.colors;
  const accent = gameAccent(theme, 'game_word_001');
  const n = state.size;
  const GAP = 8;
  const drag = useRef<{ start: number | null; dragging: boolean }>({ start: null, dragging: false });
  const [gridRef, gridWidth] = useWidth<HTMLDivElement>();
  const disabled = paused || ended;
  const lowTime = rush.remainingMs < 10_000 && !ended;
  const reasons: Record<string, string> = {
    not_adjacent: labels.notAdjacent,
    too_short: labels.tooShort,
    not_a_word: labels.notAWord,
    already_found: labels.alreadyFound,
  };
  const last = state.last;
  const scored = findEvent(events, 'wordScored');
  const rejected = findEvent(events, 'wordRejected');
  const tile = gridWidth ? (gridWidth - GAP * (n - 1)) / n : 0;
  const centre = (i: number) => ({ x: (i % n) * (tile + GAP) + tile / 2, y: Math.floor(i / n) * (tile + GAP) + tile / 2 });

  return (
    <div style={stack(theme.spacing.md, { alignItems: 'center' })}>
      <div style={stack(theme.spacing.sm, { alignSelf: 'stretch' })}>
        <div style={row(0, { justifyContent: 'space-between', alignItems: 'flex-end' })}>
          <Stat label={labels.words} value={state.found.length} icon="star" />
          <Pulse active={lowTime}>
            <Stat label={labels.time} value={formatClock(rush.remainingMs)} align="right" icon="clock" />
          </Pulse>
        </div>
        <ProgressBar fraction={rush.remainingMs / state.durationMs} color={lowTime ? c.danger : undefined} />
      </div>

      <Shake trigger={rejected ? seq : null} style={{ alignSelf: 'stretch', position: 'relative' }}>
        <div
          role="status"
          style={{
            minHeight: 52,
            borderRadius: theme.radii.lg,
            background: rush.word ? alpha(accent, 0.16) : c.surfaceAlt,
            border: `1px solid ${rush.word ? alpha(accent, 0.5) : c.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '0 12px',
          }}
        >
          {rush.word ? (
            <span style={{ color: c.text, fontSize: 26, letterSpacing: 4, ...font(theme, 'bold') }}>{rush.word}</span>
          ) : last ? (
            <>
              <Icon name={last.rejected ? 'cross' : 'check'} size={15} color={last.rejected ? c.danger : c.success} />
              <span style={{ color: last.rejected ? c.danger : c.success, fontSize: 15, ...font(theme, 'medium') }}>
                {last.rejected ? `${last.word ? `${last.word.toUpperCase()}: ` : ''}${reasons[last.rejected]}` : `${last.word.toUpperCase()} +${last.points}`}
              </span>
            </>
          ) : (
            <span style={{ color: c.textMuted, fontSize: 14 }}>Drag through touching letters, or click them</span>
          )}
        </div>
        <FloatUp trigger={scored ? seq : null} text={scored ? `+${scored.points}` : ''} style={{ top: -12 }} />
      </Shake>

      <div
        ref={gridRef}
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
        style={{ position: 'relative', width: '100%', maxWidth: 400, display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: GAP, touchAction: 'none', userSelect: 'none' }}
      >
        {state.grid.map((face, i) => {
          const inPath = rush.path.includes(i);
          const isLast = rush.path[rush.path.length - 1] === i;
          return (
            <Pop key={i} trigger={isLast ? rush.path.length : null}>
              <div
                style={{
                  aspectRatio: '1',
                  borderRadius: theme.radii.md,
                  background: inPath ? gradientCss(theme.gradients.primary) : c.surfaceRaised,
                  border: `1px solid ${inPath ? 'transparent' : c.border}`,
                  borderBottom: inPath ? '1px solid transparent' : `4px solid ${alpha(c.text, 0.18)}`,
                  boxShadow: `${shadowCss(theme, inPath ? 'md' : 'sm')}${isLast ? `, 0 0 0 3px ${c.primaryAlt}` : ''}`,
                  color: inPath ? c.onPrimary : c.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: face.length > 1 ? 'clamp(16px, 7vw, 30px)' : 'clamp(20px, 9vw, 40px)',
                  cursor: 'pointer',
                  transition: 'background 120ms, transform 120ms',
                  ...font(theme, 'bold'),
                }}
              >
                {paused ? '' : face === 'QU' ? 'Qu' : face}
              </div>
            </Pop>
          );
        })}
        {tile > 0 && rush.path.length > 1 && (
          <svg aria-hidden width={gridWidth} height={gridWidth} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <polyline
              points={rush.path.map((i) => `${centre(i).x},${centre(i).y}`).join(' ')}
              fill="none"
              stroke={alpha(c.onPrimary, 0.55)}
              strokeWidth={Math.max(6, tile * 0.16)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      <div style={row(theme.spacing.sm, { width: '100%', maxWidth: 400 })}>
        <Button variant="ghost" icon="erase" label={labels.clear} onClick={rush.clear} disabled={!rush.path.length} style={{ flex: 1 }} />
        <Button label={labels.submitWord} icon="check" onClick={rush.submit} disabled={!rush.canSubmit || disabled} style={{ flex: 2 }} />
      </div>

      {state.found.length > 0 && (
        <div style={row(6, { flexWrap: 'wrap', alignSelf: 'stretch' })}>
          {state.found
            .slice()
            .reverse()
            .map((w, k) => (
              <span
                key={w}
                style={{
                  padding: '5px 10px',
                  borderRadius: theme.radii.pill,
                  background: k === 0 ? alpha(c.success, 0.2) : c.surfaceAlt,
                  border: `1px solid ${k === 0 ? alpha(c.success, 0.5) : c.border}`,
                  color: c.text,
                  fontSize: 13,
                  animation: k === 0 ? 'sg-fade-from-left 260ms ease-out both' : undefined,
                  ...font(theme, 'medium'),
                }}
              >
                {w.toUpperCase()}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
