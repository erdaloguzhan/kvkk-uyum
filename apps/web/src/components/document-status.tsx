import type { DocumentItem } from '@/lib/types';
import { Badge } from './ui';

export function documentStatus(d: DocumentItem) {
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
