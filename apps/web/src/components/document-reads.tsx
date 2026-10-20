'use client';

import { useState } from 'react';
import { ExportButton } from './export-button';
import { Badge, Empty, ErrorAlert, Loading } from './ui';
import { formatDateTime } from '@/lib/labels';
import type { DocumentReadReport, ReadEmployee } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const name = (e: ReadEmployee) => `${e.firstName} ${e.lastName}`;

/** Çalışanların eğitim portalında verdiği "Okudum, anladım." onayları ve henüz onaylamayanlar. */
export function DocumentReads({ documentId, code }: { documentId: string; code: string }) {
  const report = useApi<DocumentReadReport>(`documents/${documentId}/reads`);
  const [tab, setTab] = useState<'reads' | 'pending'>('reads');
  const r = report.data;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2>Çalışan okuma onayları</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Çalışanlar yayınlanmış dokümanı eğitim portalında sonuna kadar okuyup &quot;Okudum, anladım.&quot; onayı verir. Yeni sürüm
            yayınlanınca onay yeni sürüm için yeniden istenir.
          </p>
        </div>
        {r && tab === 'reads' && (
          <ExportButton
            fileName={`${code} okuma onayları`}
            rows={r.reads}
            columns={[
              { label: 'Ad', value: (x) => x.employee.firstName },
              { label: 'Soyad', value: (x) => x.employee.lastName },
              { label: 'E-posta', value: (x) => x.employee.email },
              { label: 'Sürüm', value: (x) => x.versionNo },
              { label: 'Onay zamanı', value: (x) => formatDateTime(x.confirmedAt) },
            ]}
          />
        )}
      </div>
      <ErrorAlert error={report.error} />
      {!r ? (
        report.loading && <Loading />
      ) : !r.publishedVersion ? (
        <Empty title="Doküman henüz yayınlanmadı" />
      ) : (
        <>
          {!r.employeeVisible && (
            <p className="small muted">Bu doküman şu anda çalışanlara gösterilmiyor; yeni onay alınamaz.</p>
          )}
          <div className="actions" role="group" aria-label="Liste" style={{ marginBottom: 12 }}>
            <button className={`btn btn-small${tab === 'reads' ? ' btn-primary' : ''}`} onClick={() => setTab('reads')}>
              Onaylayanlar ({r.reads.length})
            </button>
            <button className={`btn btn-small${tab === 'pending' ? ' btn-primary' : ''}`} onClick={() => setTab('pending')}>
              Sürüm {r.publishedVersion.versionNo} için onaylamayanlar ({r.notConfirmed.length})
            </button>
          </div>
          {tab === 'reads' ? (
            r.reads.length === 0 ? (
              <Empty title="Henüz okuma onayı yok" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Çalışan</th>
                      <th>Okunan sürüm</th>
                      <th>Onay zamanı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.reads.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {name(x.employee)}
                          <div className="small muted">{x.employee.email}</div>
                        </td>
                        <td>
                          v{x.versionNo}{' '}
                          {x.versionId === r.publishedVersion!.id ? (
                            <Badge kind="success">Yayındaki sürüm</Badge>
                          ) : (
                            <Badge>Eski sürüm</Badge>
                          )}
                        </td>
                        <td className="nowrap">{formatDateTime(x.confirmedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : r.notConfirmed.length === 0 ? (
            <Empty title="E-postası kayıtlı tüm çalışanlar yayındaki sürümü onayladı" />
          ) : (
            <ul className="list">
              {r.notConfirmed.map((e) => (
                <li key={e.id}>
                  {name(e)} <span className="small muted">{e.email}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
