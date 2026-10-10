import type { DocumentItem } from '@/lib/types';
import { Badge } from './ui';

export function documentStatus(d: DocumentItem) {
  const status = baseStatus(d);
  if (!d.templateUpdate) return status;
  return (
    <>
      {status} <Badge kind="info">Yeni şablon v{d.templateUpdate.versionNo}</Badge>
    </>
  );
}

function baseStatus(d: DocumentItem) {
  const latest = d.latestVersion;
  if (latest && latest.status === 'draft') {
    return d.publishedVersion ? (
      <Badge kind="warning">Yayında v{d.publishedVersion.versionNo} · taslak v{latest.versionNo}</Badge>
    ) : (
      <Badge kind="warning">Taslak v{latest.versionNo}</Badge>
    );
  }
  if (d.publishedVersion) return <Badge kind="success">Yayında v{d.publishedVersion.versionNo}</Badge>;
  return <Badge>Sürüm yok</Badge>;
}
