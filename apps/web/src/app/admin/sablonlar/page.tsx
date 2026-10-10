'use client';

import { DOCUMENT_CATEGORIES } from '@kvkk/shared';
import Link from 'next/link';
import { Badge, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/labels';
import type { AdminTemplate } from '@/lib/types';
import { useApi } from '@/lib/use-api';

export default function AdminTemplatesPage() {
  const templates = useApi<{ items: AdminTemplate[] }>('admin/templates');
  if (templates.loading && !templates.data) return <Loading />;
  const items = templates.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Doküman şablonları"
        description="Kuruluşların dokümanları bu ana şablonlardan üretilir. Yeni sürüm yükleyip yayın tarihi seçtiğinizde, o tarihten sonra oluşturulan dokümanlar yeni sürümden gelir; mevcut dokümanlara güncelleme uyarısı çıkar."
        actions={
          <Link className="btn btn-primary" href="/admin/sablonlar/yeni">
            + Yeni şablon
          </Link>
        }
      />
      <ErrorAlert error={templates.error} />
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Şablon</th>
                <th>Tür</th>
                <th>Yayındaki sürüm</th>
                <th>Bekleyen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.code}>
                  <td className="nowrap">{t.code}</td>
                  <td>
                    <Link href={`/admin/sablonlar/${encodeURIComponent(t.code)}`}>{t.title}</Link>
                    {t.optional && <span className="small muted"> (opsiyonel)</span>}
                  </td>
                  <td>{DOCUMENT_CATEGORIES[t.category]}</td>
                  <td className="nowrap">
                    {t.currentVersion ? (
                      <>
                        <Badge kind="success">v{t.currentVersion.versionNo}</Badge>{' '}
                        <span className="small muted">{formatDate(t.currentVersion.effectiveFrom)}</span>
                      </>
                    ) : (
                      <Badge>Yayında değil</Badge>
                    )}
                  </td>
                  <td>
                    {t.scheduledVersions.map((v) => (
                      <div key={v.id}>
                        <Badge kind="info">
                          v{v.versionNo} · {formatDate(v.effectiveFrom)} tarihinde
                        </Badge>
                      </div>
                    ))}
                    {t.draftCount > 0 && <Badge kind="warning">{t.draftCount} taslak</Badge>}
                    {t.scheduledVersions.length === 0 && t.draftCount === 0 && <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
