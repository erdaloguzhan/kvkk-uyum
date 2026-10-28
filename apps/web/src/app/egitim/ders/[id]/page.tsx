'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Markdown } from '@/components/markdown';
import { PortalShell } from '@/components/portal-shell';
import { Alert, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { errorText } from '@/lib/api';
import { portalApi } from '@/lib/portal-api';
import type { OptionKey, PortalQuestion, PortalView } from '@/lib/types';

const OPTIONS: OptionKey[] = ['A', 'B', 'C', 'D'];

/** Eğitim akışı: ön test → ders konuları (okuma süreli) → son test → sonuç. */
export default function PortalLessonPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'warning' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi<PortalView>(`assignments/${id}`).then(setView, (err) => setError(errorText(err)));
  }, [id]);

  async function act(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const next = await portalApi<PortalView>(`assignments/${id}/${path}`, { method: 'POST', body });
      setView(next);
      if (path === 'pretest') {
        setNotice({ kind: 'info', text: `Ön test tamamlandı (notunuz: ${next.score}). Bu not eğitim sonucunuzu etkilemez. Şimdi ders konularına geçiyoruz.` });
      } else if (path === 'posttest' && next.passed === false) {
        setNotice({
          kind: 'warning',
          text: `Son testten ${next.score} aldınız; geçme notu ${next.passScore}. Konuları yeniden okuyup son testi tekrar çözmeniz gerekiyor.`,
        });
      } else {
        setNotice(null);
      }
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalShell>
      {!view ? (
        error ? <ErrorAlert error={error} /> : <Loading />
      ) : (
        <>
          <PageHeader title={view.trainingName} description={view.organizationName} />
          {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
          <ErrorAlert error={error} />
          {view.step === 'pretest' && view.questions && (
            <Exam
              title="Ön test"
              intro="Eğitime başlamadan önce bilginizi ölçmek için kısa bir test. Bu testin sonucu eğitim notunuzu etkilemez."
              questions={view.questions}
              busy={busy}
              onSubmit={(answers) => act('pretest', { answers })}
            />
          )}
          {view.step === 'topic' && view.topic && (
            <Topic view={view} busy={busy} onNext={() => act('next', { topicIndex: view.topic!.index })} />
          )}
          {view.step === 'posttest' && view.questions && (
            <Exam
              title="Son test"
              intro={`Tüm konuları tamamladınız. Eğitimi başarıyla bitirmek için son testten en az ${view.passScore} almalısınız.`}
              questions={view.questions}
              busy={busy}
              onSubmit={(answers) => act('posttest', { answers })}
            />
          )}
          {view.step === 'completed' && (
            <div className="card">
              <Alert kind="success">
                <strong>Tebrikler. Eğitimi başarıyla tamamladınız.</strong>
                {view.lastPostTest && <> Son test notunuz: {view.lastPostTest.score}.</>}
              </Alert>
              <Link className="btn" href="/egitim/egitimlerim">
                Eğitimlerime dön
              </Link>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

function Topic({ view, busy, onNext }: { view: PortalView; busy: boolean; onNext: () => void }) {
  const topic = view.topic!;
  const [remaining, setRemaining] = useState(topic.remainingSeconds);

  // Sayaç yalnızca gösterim içindir; süre kontrolü sunucuda yapılır.
  const tick = useCallback(() => setRemaining((r) => Math.max(0, r - 1)), []);
  useEffect(() => {
    setRemaining(topic.remainingSeconds);
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [topic.index, topic.remainingSeconds, tick]);

  const last = topic.index === view.topicCount - 1;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <div className="card">
      <div className="card-header">
        <span className="muted small">
          Konu {topic.index + 1} / {view.topicCount}
        </span>
        <div className="progress" style={{ flex: 1, maxWidth: 240 }}>
          <div style={{ width: `${((topic.index + 1) / view.topicCount) * 100}%` }} />
        </div>
      </div>
      <h2>{topic.title}</h2>
      <Markdown source={topic.content} />
      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
        {remaining > 0 && (
          <span className="muted small timer">
            Sonraki adıma geçmek için kalan süre: {mm}:{ss}
          </span>
        )}
        <button className="btn btn-primary" disabled={busy || remaining > 0} onClick={onNext}>
          {last ? 'Son teste geç' : 'Sonraki konu →'}
        </button>
      </div>
    </div>
  );
}

function Exam({
  title,
  intro,
  questions,
  busy,
  onSubmit,
}: {
  title: string;
  intro: string;
  questions: PortalQuestion[];
  busy: boolean;
  onSubmit: (answers: Record<string, OptionKey>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const missing = questions.filter((q) => !answers[q.id]).length;
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{intro}</p>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="exam-question" style={{ border: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, padding: 0 }}>
            {i + 1}. {q.text}
          </legend>
          {OPTIONS.map((o) => (
            <label key={o} className="checkbox">
              <input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o }))} />
              <span>
                <strong>{o})</strong> {q.options[o]}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        {missing > 0 && <span className="muted small">{missing} soru cevaplanmadı</span>}
        <button
          className="btn btn-primary"
          disabled={busy || missing > 0}
          onClick={() => confirm('Sınavı teslim etmek istiyor musunuz? Teslimden sonra cevaplar değiştirilemez.') && onSubmit(answers)}
        >
          {busy ? 'Gönderiliyor…' : 'Sınavı teslim et'}
        </button>
      </div>
    </div>
  );
}
