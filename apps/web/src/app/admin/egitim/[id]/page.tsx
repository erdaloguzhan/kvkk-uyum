'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { TopicDraft, TopicEditor } from '@/components/topic-editor';
import { Alert, Badge, Empty, ErrorAlert, Field, Loading, Modal, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { durationText, TEST_LABELS, TRAINING_STATUS } from '@/lib/training-labels';
import type { OptionKey, TestType, Trainer, TrainingDetail, TrainingQuestion, TrainingTopic } from '@/lib/types';
import { useApi } from '@/lib/use-api';

type Tab = 'info' | 'topics' | TestType;
const OPTIONS: OptionKey[] = ['A', 'B', 'C', 'D'];

/** Eğitim konu ve içeriklerini, ön/son test sorularını hazırlama ekranı. */
export default function TrainingPage() {
  const { id } = useParams<{ id: string }>();
  const training = useApi<TrainingDetail>(`training-admin/trainings/${id}`);
  const [tab, setTab] = useState<Tab>('topics');

  if (training.loading && !training.data) return <Loading />;
  if (!training.data) return <ErrorAlert error={training.error} />;
  const t = training.data;
  const reload = training.reload;

  return (
    <>
      <p className="small">
        <Link href="/admin/egitim">← Eğitimler</Link>
      </p>
      <PageHeader
        title={t.name}
        description={
          <>
            <Badge kind={TRAINING_STATUS[t.status].kind}>{TRAINING_STATUS[t.status].label}</Badge> · {t.topics.length} alt konu · Ön test{' '}
            {t.totals.pre}/100 puan · Son test {t.totals.post}/100 puan
          </>
        }
      />
      <ErrorAlert error={training.error} />
      <div className="tabs" role="tablist">
        {(
          [
            ['topics', 'Alt konular'],
            ['pre', 'Ön test soruları'],
            ['post', 'Son test soruları'],
            ['info', 'Bilgiler ve yayın'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} role="tab" className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'info' && <InfoTab training={t} onChange={reload} />}
      {tab === 'topics' && <TopicsTab training={t} onChange={reload} />}
      {(tab === 'pre' || tab === 'post') && <QuestionsTab key={tab} training={t} testType={tab} onChange={reload} />}
    </>
  );
}

function InfoTab({ training: t, onChange }: { training: TrainingDetail; onChange: () => Promise<void> }) {
  const router = useRouter();
  const trainers = useApi<{ items: Trainer[] }>('training-admin/trainers');
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? '');
  const [trainerId, setTrainerId] = useState(t.trainerId ?? '');
  const [passScore, setPassScore] = useState(String(t.passScore));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api(`training-admin/trainings/${t.id}`, { method: 'PATCH', body });
      await onChange();
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`"${t.name}" eğitimi silinsin mi? Alt konular ve sorular da silinir.`)) return;
    try {
      await api(`training-admin/trainings/${t.id}`, { method: 'DELETE' });
      router.push('/admin/egitim');
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <ErrorAlert error={error} />
      {saved && <Alert kind="success">Kaydedildi.</Alert>}
      <div className="card">
        <h2>Yayın durumu</h2>
        {t.status === 'active' ? (
          <>
            <p>Eğitim yayında; eğitim gruplarına atanabilir.</p>
            {t.groupCount === 0 && (
              <button className="btn" disabled={busy} onClick={() => patch({ status: 'draft' })}>
                Taslağa al
              </button>
            )}
          </>
        ) : t.problems.length ? (
          <Alert kind="warning">
            Yayına almadan önce:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {t.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <>
            <p>İçerik ve sorular tamam. Yayına alınca eğitim gruplara atanabilir.</p>
            <button className="btn btn-primary" disabled={busy} onClick={() => patch({ status: 'active' })}>
              Yayına al
            </button>
          </>
        )}
      </div>
      <form
        className="card form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          patch({ name, description: description || null, trainerId: trainerId || null, passScore: Number(passScore) });
        }}
      >
        <h2>Bilgiler</h2>
        <Field label="Eğitim adı" required htmlFor="i-name">
          <input id="i-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Açıklama" htmlFor="i-desc">
          <textarea id="i-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Eğitimci" htmlFor="i-trainer" hint="Sertifikada eğitimci olarak görünür.">
            <select id="i-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
              <option value="">Seçilmedi</option>
              {trainers.data?.items.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.firstName} {tr.lastName}
                  {tr.isActive ? '' : ' (pasif)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Geçme notu" htmlFor="i-pass" hint="Son testte bu not ve üzeri başarılı sayılır.">
            <input id="i-pass" type="number" min={1} max={100} value={passScore} onChange={(e) => setPassScore(e.target.value)} required />
          </Field>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={t.groupCount > 0} title={t.groupCount > 0 ? 'Gruplara atanmış eğitim silinemez' : undefined}>
            Eğitimi sil
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Kaydet
          </button>
        </div>
      </form>
    </>
  );
}

function TopicsTab({ training: t, onChange }: { training: TrainingDetail; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState<TrainingTopic | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(draft: TopicDraft) {
    if (editing === 'new') {
      await api(`training-admin/trainings/${t.id}/topics`, { method: 'POST', body: draft });
    } else if (editing) {
      await api(`training-admin/topics/${editing.id}`, { method: 'PATCH', body: draft });
    }
    setEditing(null);
    await onChange();
  }

  async function move(index: number, delta: number) {
    const ids = t.topics.map((x) => x.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setError(null);
    try {
      await api(`training-admin/trainings/${t.id}/topics/reorder`, { method: 'POST', body: { ids } });
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(topic: TrainingTopic) {
    if (!confirm(`"${topic.title}" alt konusu silinsin mi?`)) return;
    setError(null);
    try {
      await api(`training-admin/topics/${topic.id}`, { method: 'DELETE' });
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (editing) {
    return <TopicEditor topic={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} />;
  }
  const total = t.topics.reduce((s, x) => s + x.minReadSeconds, 0);
  return (
    <>
      <ErrorAlert error={error} />
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Alt konular</h2>
            <span className="muted small">
              Katılımcıya bu sırayla, her biri ayrı sayfada gösterilir. Toplam en az okuma süresi: {durationText(total)}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + Alt konu ekle
          </button>
        </div>
        {t.topics.length === 0 ? (
          <Empty title="Henüz alt konu yok" />
        ) : (
          <ul className="list">
            {t.topics.map((topic, i) => (
              <li key={topic.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 24 }}>{i + 1}.</strong>
                <span style={{ flex: 1 }}>
                  {topic.title}
                  <span className="muted small"> · en az {durationText(topic.minReadSeconds)}</span>
                </span>
                <span className="actions">
                  <button className="btn btn-small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı taşı">
                    ↑
                  </button>
                  <button className="btn btn-small" disabled={i === t.topics.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı taşı">
                    ↓
                  </button>
                  <button className="btn btn-small" onClick={() => setEditing(topic)}>
                    Düzenle
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => remove(topic)}>
                    Sil
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const emptyQuestion = { text: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A' as OptionKey, points: '10' };

function QuestionsTab({ training: t, testType, onChange }: { training: TrainingDetail; testType: TestType; onChange: () => Promise<void> }) {
  const questions = t.questions.filter((q) => q.testType === testType);
  const total = t.totals[testType];
  const [editing, setEditing] = useState<TrainingQuestion | 'new' | null>(null);
  const [form, setForm] = useState(emptyQuestion);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing === 'new') setForm({ ...emptyQuestion, points: String(Math.min(10, Math.max(1, 100 - total))) });
    else if (editing) setForm({ ...editing, points: String(editing.points) });
    setFormError(null);
    // total yalnızca yeni soru açılırken önerilen puan için kullanılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const body = {
      text: form.text,
      optionA: form.optionA,
      optionB: form.optionB,
      optionC: form.optionC,
      optionD: form.optionD,
      correctOption: form.correctOption,
      points: Number(form.points),
    };
    try {
      if (editing === 'new') {
        await api(`training-admin/trainings/${t.id}/questions`, { method: 'POST', body: { ...body, testType } });
      } else if (editing) {
        await api(`training-admin/questions/${editing.id}`, { method: 'PATCH', body });
      }
      setEditing(null);
      await onChange();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(q: TrainingQuestion) {
    if (!confirm('Soru silinsin mi?')) return;
    setError(null);
    try {
      await api(`training-admin/questions/${q.id}`, { method: 'DELETE' });
      await onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const set = (k: keyof typeof emptyQuestion) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <ErrorAlert error={error} />
      {t.questionsLocked && (
        <Alert kind="info">Katılımcılar bu eğitimin sınavlarını çözdüğü için sorular artık değiştirilemez (sonuçlar sorulara bağlıdır).</Alert>
      )}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>{TEST_LABELS[testType]} soruları</h2>
            <span className="muted small">
              {testType === 'pre'
                ? 'Eğitimin başında çözülür; sonucu yalnızca kaydedilir, eğitim notunu etkilemez.'
                : `Konulardan sonra çözülür; ${t.passScore} ve üzeri başarılı sayılır.`}{' '}
              Soruların puanları toplamı 100 olmalı.
            </span>
          </div>
          <span className="actions">
            <Badge kind={total === 100 ? 'success' : 'warning'}>Toplam {total}/100</Badge>
            <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={t.questionsLocked || total >= 100}>
              + Soru ekle
            </button>
          </span>
        </div>
        {questions.length === 0 ? (
          <Empty title="Henüz soru yok" />
        ) : (
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {questions.map((q) => (
              <li key={q.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <strong>{q.text}</strong>
                  <span className="actions">
                    <Badge>{q.points} puan</Badge>
                    {!t.questionsLocked && (
                      <>
                        <button className="btn btn-small" onClick={() => setEditing(q)}>
                          Düzenle
                        </button>
                        <button className="btn btn-small btn-danger" onClick={() => remove(q)}>
                          Sil
                        </button>
                      </>
                    )}
                  </span>
                </div>
                <ul className="question-options">
                  {OPTIONS.map((o) => (
                    <li key={o} className={q.correctOption === o ? 'correct' : undefined}>
                      {o}) {q[`option${o}`]}
                      {q.correctOption === o && ' ✓'}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? `Yeni ${TEST_LABELS[testType].toLocaleLowerCase('tr')} sorusu` : 'Soruyu düzenle'}>
        <form className="form" onSubmit={save}>
          <ErrorAlert error={formError} />
          <Field label="Soru" required htmlFor="q-text">
            <textarea id="q-text" value={form.text} onChange={set('text')} required />
          </Field>
          {OPTIONS.map((o) => (
            <Field key={o} label={`Cevap ${o}`} required htmlFor={`q-${o}`}>
              <input id={`q-${o}`} value={form[`option${o}`]} onChange={set(`option${o}`)} required />
            </Field>
          ))}
          <div className="form-row">
            <Field label="Doğru cevap" required htmlFor="q-correct">
              <select id="q-correct" value={form.correctOption} onChange={set('correctOption')}>
                {OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Puan değeri" required htmlFor="q-points">
              <input id="q-points" type="number" min={1} max={100} value={form.points} onChange={set('points')} required />
            </Field>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
