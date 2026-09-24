import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, json, QuizBank, QuizBankSummary } from '../api';
import { BANK_ID, emptyRow, isBlank, MAX_QUESTIONS, problems, parsePastedRows, Row, toQuestion, toRow } from '../quizRows';


export function QuizBanksTab({ appId }: { appId: string }) {
  const [banks, setBanks] = useState<QuizBankSummary[] | null>(null);
  const [editing, setEditing] = useState<QuizBank | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<QuizBankSummary[]>(`/apps/${appId}/quiz-banks`)
        .then(setBanks)
        .catch((e: Error) => setError(e.message)),
    [appId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const open = async (bankId: string) => {
    setError(null);
    try {
      setEditing(await api<QuizBank>(`/apps/${appId}/quiz-banks/${encodeURIComponent(bankId)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the bank');
    }
  };

  const remove = async (bank: QuizBankSummary) => {
    if (!window.confirm(`Delete "${bank.name || bank.bankId}"? Sessions that use bankId "${bank.bankId}" will fail to start.`)) return;
    await api(`/apps/${appId}/quiz-banks/${encodeURIComponent(bank.bankId)}`, { method: 'DELETE' });
    load();
  };

  if (editing) {
    return (
      <BankEditor
        appId={appId}
        bank={editing === 'new' ? null : editing}
        existingIds={(banks ?? []).map((b) => b.bankId)}
        onDone={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <p className="muted">
        A quiz bank is your own set of questions for Quiz Master. Start a session or battle with{' '}
        <code>{'"config": { "bankId": "<bank id>" }'}</code> and questions are drawn from the bank.
      </p>
      {error && <p className="error">{error}</p>}
      <div>
        <button className="primary" onClick={() => setEditing('new')}>New quiz bank</button>
      </div>
      {!banks ? (
        <p className="muted">Loading…</p>
      ) : (
        <table>
          <thead>
            <tr><th>Bank id</th><th>Name</th><th>Questions</th><th>Updated</th><th /></tr>
          </thead>
          <tbody>
            {banks.length === 0 && <tr><td colSpan={5} className="muted">No quiz banks yet.</td></tr>}
            {banks.map((b) => (
              <tr key={b.bankId}>
                <td><code>{b.bankId}</code></td>
                <td>{b.name || <span className="muted">—</span>}</td>
                <td>{b.questionCount}</td>
                <td>{new Date(b.updatedAt).toLocaleString()}</td>
                <td className="right">
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="ghost small" onClick={() => open(b.bankId)}>Edit</button>
                    <button className="danger small" onClick={() => remove(b)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BankEditor({
  appId,
  bank,
  existingIds,
  onDone,
}: {
  appId: string;
  bank: QuizBank | null;
  existingIds: string[];
  onDone: () => void;
}) {
  const [bankId, setBankId] = useState(bank?.bankId ?? '');
  const [name, setName] = useState(bank?.name ?? '');
  const [rows, setRows] = useState<Row[]>(bank ? bank.questions.map(toRow) : [emptyRow()]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setWrong = (i: number, k: number, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, wrong: r.wrong.map((w, l) => (l === k ? value : w)) } : r)));

  const importPaste = () => {
    const pasted = parsePastedRows(paste);
    if (pasted.length === 0) return setError('Nothing to import. Paste rows with the question, the answer and wrong answers in columns.');
    setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...pasted]);
    setPaste('');
    setError(null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const id = bankId.trim();
    if (!BANK_ID.test(id)) return setError('Bank id may use letters, digits, - and _ (up to 64).');
    if (!bank && existingIds.includes(id)) return setError(`A bank called "${id}" already exists.`);
    const problem = problems(rows);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      const questions = rows.filter((r) => !isBlank(r)).map(toQuestion);
      await api(`/apps/${appId}/quiz-banks/${encodeURIComponent(id)}`, { method: 'PUT', body: json({ name, questions }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the bank');
    } finally {
      setSaving(false);
    }
  };

  const count = rows.filter((r) => !isBlank(r)).length;

  return (
    <form className="stack" onSubmit={save}>
      <div>
        <button type="button" className="link small" onClick={onDone}>← All quiz banks</button>
        <h2>{bank ? `Edit ${bank.name || bank.bankId}` : 'New quiz bank'}</h2>
      </div>

      <div className="card row wrap">
        <label className="grow">
          Bank id
          <input value={bankId} disabled={!!bank} maxLength={64} onChange={(e) => setBankId(e.target.value)} placeholder="relocation" />
          <span className="hint">Used as <code>bankId</code> in session config. Can't be changed later.</span>
        </label>
        <label className="grow">
          Name
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Relocation basics" />
        </label>
      </div>

      <details className="card">
        <summary>Paste from a spreadsheet</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <p className="muted small">
            Copy rows with these columns and paste them here: <strong>Question</strong>, <strong>Correct answer</strong>,{' '}
            <strong>Wrong 1</strong>, <strong>Wrong 2</strong>, <strong>Wrong 3</strong>. A header row is skipped.
          </p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Pasted rows" />
          <div><button type="button" className="ghost" onClick={importPaste} disabled={!paste.trim()}>Add these questions</button></div>
        </div>
      </details>

      {rows.map((r, i) => (
        <div key={i} className="card question">
          <span className="num">{i + 1}</span>
          <div className="fields">
            <label className="wide">
              Question
              <input value={r.question} maxLength={300} onChange={(e) => update(i, { question: e.target.value })} />
            </label>
            <label>
              Correct answer
              <input value={r.answer} maxLength={300} onChange={(e) => update(i, { answer: e.target.value })} />
            </label>
            {r.wrong.map((w, k) => (
              <label key={k}>
                Wrong answer {k + 1}
                <input value={w} maxLength={300} onChange={(e) => setWrong(i, k, e.target.value)} />
              </label>
            ))}
            <label>
              Category <span className="hint">optional</span>
              <input value={r.category} maxLength={40} onChange={(e) => update(i, { category: e.target.value })} />
            </label>
            <label>
              Difficulty <span className="hint">optional</span>
              <select value={r.difficulty} onChange={(e) => update(i, { difficulty: e.target.value as Row['difficulty'] })}>
                <option value="">—</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <div className="wide">
              <button type="button" className="danger small" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length === 1}>
                Remove question
              </button>
            </div>
          </div>
        </div>
      ))}

      <div>
        <button type="button" className="ghost" onClick={() => setRows((rs) => [...rs, emptyRow()])} disabled={rows.length >= MAX_QUESTIONS}>
          Add question
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" disabled={saving}>{saving ? 'Saving…' : `Save bank (${count} question${count === 1 ? '' : 's'})`}</button>
        <button type="button" className="ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
