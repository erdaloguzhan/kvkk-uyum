'use client';

import { AUDIT_ACTIONS, AUDIT_MODULES } from '@kvkk/shared';
import { useEffect, useState } from 'react';
import { ExportButton } from '@/components/export-button';
import { Empty, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fieldLabel, formatDateTime } from '@/lib/labels';
import { useSession } from '@/lib/session';
import type { AuditLogEntry } from '@/lib/types';
import { useMembers } from '@/lib/use-members';

const PAGE = 100;

function actionLabel(l: AuditLogEntry) {
  return AUDIT_ACTIONS[l.action] ?? l.action;
}

/** İşlemi yapan: kullanıcı veya portaldaki çalışan (e-postası). */
function actor(l: AuditLogEntry) {
  if (l.user) return l.user.fullName;
  const account = l.metadata?.account;
  return typeof account === 'string' ? `Çalışan: ${account}` : 'Sistem';
}

const HIDDEN_KEYS = new Set(['account', 'method', 'params']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_LABELS: Record<string, string> = {
  fields: 'Alanlar',
  changes: 'Değişen satır',
  note: 'Not',
  versionNo: 'Sürüm',
  department: 'Departman',
  activity: 'Faaliyet',
  dataCategory: 'Veri kategorisi',
  partyName: 'Taraf',
  dueDate: 'Son tarih',
  type: 'Tür',
  status: 'Durum',
  sent: 'Gönderilen',
  skipped: 'Atlanan',
  participants: 'Katılımcı',
  created: 'Oluşturulan',
  role: 'Rol',
  email: 'E-posta',
  employeeVisible: 'Çalışanlara açık',
  fileName: 'Dosya',
  rows: 'Satır',
  entries: 'Satır',
  imported: 'Aktarılan',
  removed: 'Silinen',
  mode: 'Yöntem',
};

/** Log ayrıntısının kısa metni; kayıt kimlikleri (uuid) ekranda gösterilmez, Excel'de de yer almaz. */
function details(l: AuditLogEntry) {
  if (!l.metadata) return '';
  return Object.entries(l.metadata)
    .filter(([k, v]) => !HIDDEN_KEYS.has(k) && v !== null && v !== undefined && v !== '')
    .filter(([, v]) => !(typeof v === 'string' && UUID.test(v)) && (typeof v !== 'object' || Array.isArray(v)))
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.some((x) => typeof x === 'object')) return `${KEY_LABELS[k] ?? k}: ${v.length}`;
        return `${KEY_LABELS[k] ?? k}: ${v.map((x) => (k === 'fields' ? fieldLabel(String(x)) : String(x))).join(', ')}`;
      }
      const value = typeof v === 'boolean' ? (v ? 'evet' : 'hayır') : String(v);
      return k === 'path' ? value : `${KEY_LABELS[k] ?? k}: ${value}`;
    })
    .join(' · ');
}

/** Kuruluşta yapılan tüm işlemlerin kaydı (kim, ne zaman, ne yaptı, hangi IP'den). */
export default function AuditLogPage() {
  const { org } = useSession();
  const { options: members } = useMembers();
  const [module, setModule] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(before?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ items: AuditLogEntry[] }>('audit-logs', {
        query: {
          limit: PAGE,
          module: module || undefined,
          userId: userId || undefined,
          from: from || undefined,
          to: to || undefined,
          before,
        },
      });
      setItems((prev) => (before ? [...(prev ?? []), ...res.items] : res.items));
      setMore(res.items.length === PAGE);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, userId, from, to, org?.id]);

  return (
    <>
      <PageHeader
        title="İşlem kayıtları"
        description="Sistemde yapılan her işlem kim tarafından, ne zaman ve hangi IP adresinden yapıldığıyla kaydedilir. Kayıtlar değiştirilemez."
        actions={
          <ExportButton
            fileName="İşlem kayıtları"
            rows={items ?? []}
            columns={[
              { label: 'Zaman', value: (l) => formatDateTime(l.createdAt) },
              { label: 'Kişi', value: actor },
              { label: 'E-posta', value: (l) => l.user?.email },
              { label: 'İşlem', value: actionLabel },
              { label: 'Ayrıntı', value: details },
              { label: 'IP adresi', value: (l) => l.ip },
            ]}
          />
        }
      />
      <div className="toolbar">
        <select aria-label="Bölüm" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Tüm bölümler</option>
          {Object.entries(AUDIT_MODULES).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
        <select aria-label="Kişi" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Tüm kişiler</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
        <label className="small">
          Başlangıç <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="small">
          Bitiş <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <ErrorAlert error={error} />
      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty title="Bu filtreye uyan kayıt yok" />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Kişi</th>
                  <th>İşlem</th>
                  <th>Ayrıntı</th>
                  <th>IP adresi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="nowrap small">{formatDateTime(l.createdAt)}</td>
                    <td>
                      {actor(l)}
                      {l.user && <div className="small muted">{l.user.email}</div>}
                    </td>
                    <td>{actionLabel(l)}</td>
                    <td className="small">{details(l)}</td>
                    <td className="small nowrap" title={l.userAgent ?? undefined}>
                      {l.ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more && (
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy} onClick={() => load(items[items.length - 1].createdAt)}>
                {busy ? 'Yükleniyor…' : 'Daha eski kayıtlar'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
