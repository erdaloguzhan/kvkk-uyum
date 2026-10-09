import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailerService } from '../src/auth/mailer.service';
import { AlarmsService } from '../src/workflow/alarms.service';
import { addDays, dateIn } from '../src/workflow/dates';
import { createApp, extractCode, lastMailTo, login, registerAndLogin, uniqueEmail } from './helpers';

const PROFILE = {
  address: 'Atatürk Cad. No:1 Çankaya/Ankara',
  email: 'info@ornek.com.tr',
  phone: '+90 312 000 00 00',
  kepAddress: 'ornek@hs01.kep.tr',
  authorizedPerson: 'Ayşe Yılmaz',
  taxNumber: '1234567890',
  website: 'www.ornek.com.tr',
};

const DAY = 24 * 60 * 60 * 1000;
const today = () => dateIn(new Date());
/** Bugünden `days` gün sonrası, öğlen (Türkiye saatiyle 15:00) — alarm taramasını ileri tarihte çalıştırmak için. */
const daysLater = (days: number) => new Date(Date.now() + days * DAY);

describe('İş akışı ve alarmlar', () => {
  let app: INestApplication;
  let server: any;
  let alarms: AlarmsService;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    alarms = app.get(AlarmsService);
  });
  afterAll(() => app.close());

  async function setupOrg() {
    const admin = await registerAndLogin(app);
    const res = await request(server)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Örnek Ticaret A.Ş.', ...PROFILE })
      .expect(201);
    const orgId: string = res.body.id;
    const as = (token: string) => ({ Authorization: `Bearer ${token}`, 'X-Organization-Id': orgId });
    return { admin, orgId, as };
  }

  async function addMember(admin: { accessToken: string }, as: (t: string) => any, role: string | { permissions: string[] }) {
    let roleId: string;
    if (typeof role === 'string') {
      const roles = await request(server).get('/api/v1/roles').set(as(admin.accessToken)).expect(200);
      roleId = roles.body.items.find((r: any) => r.key === role).id;
    } else {
      const created = await request(server)
        .post('/api/v1/roles')
        .set(as(admin.accessToken))
        .send({ name: `Rol ${Math.random()}`, permissions: role.permissions })
        .expect(201);
      roleId = created.body.id;
    }
    const email = uniqueEmail('uye');
    const member = await request(server)
      .post('/api/v1/members')
      .set(as(admin.accessToken))
      .send({ email, fullName: 'Mehmet Demir', roleId })
      .expect(201);
    const token = extractCode(lastMailTo(app, email).text);
    await request(server).post('/api/v1/auth/password-reset/confirm').send({ token, password: 'DavetSifre2026' }).expect(204);
    return { ...(await login(app, email, 'DavetSifre2026')), membershipId: member.body.id as string };
  }

  async function notificationsOf(headers: Record<string, string>, taskId?: string) {
    const res = await request(server).get('/api/v1/notifications').set(headers).expect(200);
    return (res.body.items as any[]).filter((n) => !taskId || n.taskId === taskId);
  }

  it('görev atar, atanana bildirim ve e-posta gönderir', async () => {
    const { admin, as } = await setupOrg();
    const officer = await addMember(admin, as, 'kvkk_officer');
    const viewer = await addMember(admin, as, 'viewer');
    const dueDate = addDays(today(), 30);

    await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Geçmiş', assigneeId: officer.user.id, dueDate: addDays(today(), -1) })
      .expect(400);
    const outsider = await registerAndLogin(app);
    await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Dışarıdan', assigneeId: outsider.user.id, dueDate })
      .expect(400);
    await request(server)
      .post('/api/v1/tasks')
      .set(as(viewer.accessToken))
      .send({ title: 'Yetkisiz', assigneeId: viewer.user.id, dueDate })
      .expect(403);

    const created = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({
        type: 'document_review',
        title: 'Aydınlatma metnini gözden geçir',
        assigneeId: officer.user.id,
        dueDate,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      type: 'document_review',
      status: 'open',
      reminderDays: [7, 1],
      daysLeft: 30,
      overdue: false,
      assignee: { id: officer.user.id, fullName: 'Mehmet Demir' },
    });

    const mail = lastMailTo(app, officer.email);
    expect(mail.subject).toBe('Yeni görev: Aydınlatma metnini gözden geçir');
    const notes = await notificationsOf(as(officer.accessToken));
    expect(notes).toEqual([expect.objectContaining({ kind: 'task_assigned', taskId: created.body.id, readAt: null })]);

    const list = await request(server).get('/api/v1/tasks?mine=true').set(as(officer.accessToken)).expect(200);
    expect(list.body.items.map((t: any) => t.id)).toEqual([created.body.id]);
    // Görüntüleyici tüm görevleri görür ama değiştiremez.
    const all = await request(server).get('/api/v1/tasks').set(as(viewer.accessToken)).expect(200);
    expect(all.body.items).toHaveLength(1);
    await request(server).post(`/api/v1/tasks/${created.body.id}/complete`).set(as(viewer.accessToken)).send({}).expect(403);

    const summary = await request(server).get('/api/v1/tasks/summary').set(as(admin.accessToken)).expect(200);
    expect(summary.body).toMatchObject({ open: 1, overdue: 0, dueWithin7Days: 0 });
  });

  it('görev yetkisi olmayan üye yalnızca kendi görevlerini görür ve tamamlar', async () => {
    const { admin, as } = await setupOrg();
    const staff = await addMember(admin, as, { permissions: ['documents.read'] });
    const officer = await addMember(admin, as, 'kvkk_officer');
    const dueDate = addDays(today(), 10);
    const mine = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Çalışan görevi', assigneeId: staff.user.id, dueDate })
      .expect(201);
    const other = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Başkasının görevi', assigneeId: officer.user.id, dueDate })
      .expect(201);

    const list = await request(server).get('/api/v1/tasks').set(as(staff.accessToken)).expect(200);
    expect(list.body.items.map((t: any) => t.id)).toEqual([mine.body.id]);
    await request(server).get(`/api/v1/tasks/${other.body.id}`).set(as(staff.accessToken)).expect(404);
    await request(server).post(`/api/v1/tasks/${other.body.id}/complete`).set(as(staff.accessToken)).send({}).expect(404);
    await request(server).get('/api/v1/tasks/summary').set(as(staff.accessToken)).expect(403);

    const done = await request(server)
      .post(`/api/v1/tasks/${mine.body.id}/complete`)
      .set(as(staff.accessToken))
      .send({ note: 'Yapıldı' })
      .expect(200);
    expect(done.body.task).toMatchObject({ status: 'done', completionNote: 'Yapıldı', completedBy: staff.user.id });
    expect(done.body.next).toBeNull();
    await request(server).post(`/api/v1/tasks/${mine.body.id}/complete`).set(as(staff.accessToken)).send({}).expect(409);
  });

  it('tekrarlayan görev tamamlanınca sonraki dönem açılır', async () => {
    const { admin, as } = await setupOrg();
    const officer = await addMember(admin, as, 'kvkk_officer');
    const entry = await request(server)
      .post('/api/v1/inventory')
      .set(as(admin.accessToken))
      .send({ department: 'Muhasebe', activity: 'Bordro', dataCategory: 'Kimlik' })
      .expect(201);
    await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Bağlı', assigneeId: officer.user.id, dueDate: today(), entityType: 'document' })
      .expect(400);
    await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({
        title: 'Yanlış kayıt',
        assigneeId: officer.user.id,
        dueDate: today(),
        entityType: 'document',
        entityId: entry.body.id,
      })
      .expect(400);
    await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Garip aralık', assigneeId: officer.user.id, dueDate: today(), recurrenceMonths: 5 })
      .expect(400);

    const dueDate = addDays(today(), 2);
    const created = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({
        type: 'inventory_review',
        title: 'Envanteri gözden geçir',
        assigneeId: officer.user.id,
        dueDate,
        reminderDays: [14, 3, 3],
        recurrenceMonths: 6,
        entityType: 'inventory_entry',
        entityId: entry.body.id,
      })
      .expect(201);
    expect(created.body.reminderDays).toEqual([14, 3]);

    const done = await request(server)
      .post(`/api/v1/tasks/${created.body.id}/complete`)
      .set(as(officer.accessToken))
      .send({})
      .expect(200);
    const { addMonths } = await import('../src/workflow/dates');
    expect(done.body.next).toMatchObject({
      status: 'open',
      dueDate: addMonths(dueDate, 6),
      recurrenceMonths: 6,
      reminderDays: [14, 3],
      previousTaskId: created.body.id,
      entityType: 'inventory_entry',
      entityId: entry.body.id,
      assignee: { id: officer.user.id },
    });
    const linked = await request(server)
      .get(`/api/v1/tasks?entityType=inventory_entry&entityId=${entry.body.id}&status=open`)
      .set(as(admin.accessToken))
      .expect(200);
    expect(linked.body.items.map((t: any) => t.id)).toEqual([done.body.next.id]);
  });

  it('görevi günceller ve iptal eder', async () => {
    const { admin, as } = await setupOrg();
    const a = await addMember(admin, as, 'kvkk_officer');
    const b = await addMember(admin, as, 'kvkk_officer');
    const created = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'İmha', type: 'data_destruction', assigneeId: a.user.id, dueDate: addDays(today(), 20) })
      .expect(201);
    const updated = await request(server)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ assigneeId: b.user.id, dueDate: addDays(today(), 25) })
      .expect(200);
    expect(updated.body).toMatchObject({ assignee: { id: b.user.id }, daysLeft: 25 });
    expect(await notificationsOf(as(b.accessToken), created.body.id)).toHaveLength(1);

    await request(server).post(`/api/v1/tasks/${created.body.id}/cancel`).set(as(a.accessToken)).expect(200);
    const cancelled = await request(server).get(`/api/v1/tasks/${created.body.id}`).set(as(admin.accessToken)).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', daysLeft: null, overdue: false });
    await request(server)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(as(admin.accessToken))
      .send({ title: 'Yeni ad' })
      .expect(409);

    const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
    const actions = logs.body.items.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['task.created', 'task.updated', 'task.cancelled']));
  });

  it('hatırlatma, son gün ve gecikme alarmlarını bir kez üretir', async () => {
    const { admin, as } = await setupOrg();
    const officer = await addMember(admin, as, 'kvkk_officer');
    const created = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Politika gözden geçirme', assigneeId: officer.user.id, dueDate: addDays(today(), 10) })
      .expect(201);
    // Görev 3 gün kala açıldı: 7 gün hatırlatması atlanır, yalnızca 1 gün kala gelir.
    const late = await request(server)
      .post('/api/v1/tasks')
      .set(as(admin.accessToken))
      .send({ title: 'Geç açılan', assigneeId: officer.user.id, dueDate: addDays(today(), 3) })
      .expect(201);
    const id = created.body.id;
    const kinds = async (taskId = id) =>
      (await notificationsOf(as(officer.accessToken), taskId)).map((n) => n.kind).sort();

    await alarms.run(daysLater(1));
    expect(await kinds()).toEqual(['task_assigned']);
    expect(await kinds(late.body.id)).toEqual(['task_assigned']);

    await alarms.run(daysLater(2)); // geç açılan görevin son gününe 1 gün kaldı
    expect(await kinds(late.body.id)).toEqual(['task_assigned', 'task_reminder']);
    expect(await kinds()).toEqual(['task_assigned']);

    const mailer = app.get(MailerService);
    const before = mailer.outbox.length;
    await alarms.run(daysLater(3)); // 7 gün kaldı
    await alarms.run(daysLater(3));
    await alarms.run(daysLater(5)); // 5 gün kaldı, 7 günlük hatırlatma zaten gitti
    expect(await kinds()).toEqual(['task_assigned', 'task_reminder']);
    expect(mailer.outbox.slice(before).filter((m) => m.subject.includes('Politika gözden geçirme'))).toEqual([
      expect.objectContaining({ to: officer.email, subject: 'Hatırlatma: Politika gözden geçirme (7 gün kaldı)' }),
    ]);

    await alarms.run(daysLater(9));
    await alarms.run(daysLater(10));
    expect(await kinds()).toEqual(['task_assigned', 'task_due_today', 'task_reminder', 'task_reminder']);

    await alarms.run(daysLater(11));
    await alarms.run(daysLater(12));
    const overdue = (await notificationsOf(as(officer.accessToken), id)).filter((n) => n.kind === 'task_overdue');
    expect(overdue).toHaveLength(1);
    // Görevi açan yöneticiye de bir kez haber verilir.
    const adminNotes = async () => (await notificationsOf(as(admin.accessToken), id)).map((n) => n.kind);
    expect(await adminNotes()).toEqual(['task_overdue']);

    await alarms.run(daysLater(18)); // gecikmenin 8. günü: haftalık tekrar
    await alarms.run(daysLater(19));
    expect((await notificationsOf(as(officer.accessToken), id)).filter((n) => n.kind === 'task_overdue')).toHaveLength(2);
    expect(await adminNotes()).toEqual(['task_overdue']);

    const listed = await request(server).get('/api/v1/tasks?overdue=false').set(as(admin.accessToken)).expect(200);
    expect(listed.body.items.map((t: any) => t.id)).toEqual(expect.arrayContaining([id, late.body.id]));

    // Tamamlanan göreve alarm gelmez.
    await request(server).post(`/api/v1/tasks/${id}/complete`).set(as(officer.accessToken)).send({}).expect(200);
    await alarms.run(daysLater(26));
    expect((await notificationsOf(as(officer.accessToken), id)).filter((n) => n.kind === 'task_overdue')).toHaveLength(2);
  });

  it('bildirimleri okundu işaretler', async () => {
    const { admin, as } = await setupOrg();
    const officer = await addMember(admin, as, 'kvkk_officer');
    for (const title of ['Bir', 'İki']) {
      await request(server)
        .post('/api/v1/tasks')
        .set(as(admin.accessToken))
        .send({ title, assigneeId: officer.user.id, dueDate: addDays(today(), 5) })
        .expect(201);
    }
    const res = await request(server).get('/api/v1/notifications').set(as(officer.accessToken)).expect(200);
    expect(res.body.unreadCount).toBe(2);
    const [first] = res.body.items;
    await request(server).post(`/api/v1/notifications/${first.id}/read`).set(as(admin.accessToken)).expect(404);
    await request(server).post(`/api/v1/notifications/${first.id}/read`).set(as(officer.accessToken)).expect(204);
    const unread = await request(server).get('/api/v1/notifications?unread=true').set(as(officer.accessToken)).expect(200);
    expect(unread.body).toMatchObject({ unreadCount: 1, items: [expect.objectContaining({ readAt: null })] });
    await request(server).post('/api/v1/notifications/read-all').set(as(officer.accessToken)).expect(204);
    const after = await request(server).get('/api/v1/notifications').set(as(officer.accessToken)).expect(200);
    expect(after.body.unreadCount).toBe(0);
  });

  describe('doküman onayı', () => {
    async function setupDoc() {
      const ctx = await setupOrg();
      const officer = await addMember(ctx.admin, ctx.as, 'kvkk_officer');
      const viewer = await addMember(ctx.admin, ctx.as, 'viewer');
      const doc = await request(server)
        .post('/api/v1/documents')
        .set(ctx.as(ctx.admin.accessToken))
        .send({ templateCode: 'AYM-010' })
        .expect(201);
      return { ...ctx, officer, viewer, docId: doc.body.id as string, versionId: doc.body.versions[0].id as string };
    }

    it('onaylanınca sürüm yayınlanır, görev kapanır, talep edene haber verilir', async () => {
      const { admin, as, officer, viewer, docId, versionId } = await setupDoc();
      const url = `/api/v1/documents/${docId}/versions/${versionId}/approval-requests`;
      await request(server).post(url).set(as(admin.accessToken)).send({ approverId: viewer.user.id }).expect(400);
      await request(server).post(url).set(as(viewer.accessToken)).send({ approverId: officer.user.id }).expect(403);

      const req = await request(server)
        .post(url)
        .set(as(admin.accessToken))
        .send({ approverId: officer.user.id, note: 'Adres güncellendi' })
        .expect(201);
      expect(req.body).toMatchObject({
        status: 'pending',
        dueDate: addDays(today(), 7),
        document: { id: docId, code: 'AYM-010' },
        version: { id: versionId, versionNo: 1, status: 'draft' },
        approver: { id: officer.user.id },
        requestedBy: { id: admin.user.id },
      });
      await request(server).post(url).set(as(admin.accessToken)).send({ approverId: officer.user.id }).expect(409);
      expect(lastMailTo(app, officer.email).subject).toMatch(/^Onay talebi: AYM-010 /);

      const tasks = await request(server).get('/api/v1/tasks?mine=true').set(as(officer.accessToken)).expect(200);
      expect(tasks.body.items).toEqual([
        expect.objectContaining({ id: req.body.taskId, type: 'approval', entityType: 'document', entityId: docId }),
      ]);
      await request(server).post(`/api/v1/tasks/${req.body.taskId}/complete`).set(as(officer.accessToken)).send({}).expect(409);
      await request(server).patch(`/api/v1/tasks/${req.body.taskId}`).set(as(admin.accessToken)).send({ title: 'Yeni ad' }).expect(409);

      // Yalnızca seçilen onaylayıcı karar verebilir.
      await request(server).post(`/api/v1/approval-requests/${req.body.id}/approve`).set(as(admin.accessToken)).send({}).expect(403);
      // Görüntüleyici talebi göremez.
      await request(server).get(`/api/v1/approval-requests/${req.body.id}`).set(as(viewer.accessToken)).expect(404);
      const pending = await request(server)
        .get('/api/v1/approval-requests?status=pending')
        .set(as(officer.accessToken))
        .expect(200);
      expect(pending.body.items.map((r: any) => r.id)).toEqual([req.body.id]);

      const approved = await request(server)
        .post(`/api/v1/approval-requests/${req.body.id}/approve`)
        .set(as(officer.accessToken))
        .send({ note: 'Uygun' })
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'approved', decisionNote: 'Uygun', version: { status: 'published' } });
      await request(server).post(`/api/v1/approval-requests/${req.body.id}/approve`).set(as(officer.accessToken)).send({}).expect(409);

      const doc = await request(server).get(`/api/v1/documents/${docId}`).set(as(viewer.accessToken)).expect(200);
      expect(doc.body.publishedVersionId).toBe(versionId);
      const task = await request(server).get(`/api/v1/tasks/${req.body.taskId}`).set(as(officer.accessToken)).expect(200);
      expect(task.body).toMatchObject({ status: 'done', completedBy: officer.user.id });
      const adminNotes = await notificationsOf(as(admin.accessToken));
      expect(adminNotes).toEqual([expect.objectContaining({ kind: 'approval_decided', approvalRequestId: req.body.id })]);
      expect(adminNotes[0].title).toMatch(/onaylandı ve yayınlandı$/);

      const logs = await request(server).get('/api/v1/audit-logs').set(as(admin.accessToken)).expect(200);
      expect(logs.body.items.map((l: any) => l.action)).toEqual(
        expect.arrayContaining(['approval.requested', 'approval.approved', 'document.published']),
      );
    });

    it('ret gerekçesiyle reddedilir; iptal edilir; eskiyen talep onaylanamaz', async () => {
      const { admin, as, officer, docId, versionId } = await setupDoc();
      const url = `/api/v1/documents/${docId}/versions/${versionId}/approval-requests`;
      const first = await request(server).post(url).set(as(admin.accessToken)).send({ approverId: officer.user.id }).expect(201);
      await request(server).post(`/api/v1/approval-requests/${first.body.id}/reject`).set(as(officer.accessToken)).send({}).expect(400);
      const rejected = await request(server)
        .post(`/api/v1/approval-requests/${first.body.id}/reject`)
        .set(as(officer.accessToken))
        .send({ note: 'Adres eksik' })
        .expect(200);
      expect(rejected.body).toMatchObject({ status: 'rejected', decisionNote: 'Adres eksik', version: { status: 'draft' } });
      expect(lastMailTo(app, admin.email).text).toContain('Not: Adres eksik');

      // Reddedilen sürüm için yeniden onay istenebilir, sonra iptal edilebilir.
      const second = await request(server).post(url).set(as(admin.accessToken)).send({ approverId: officer.user.id }).expect(201);
      const cancelled = await request(server).post(`/api/v1/approval-requests/${second.body.id}/cancel`).set(as(admin.accessToken)).expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      const task = await request(server).get(`/api/v1/tasks/${second.body.taskId}`).set(as(admin.accessToken)).expect(200);
      expect(task.body.status).toBe('cancelled');
      await request(server).post(`/api/v1/approval-requests/${second.body.id}/cancel`).set(as(admin.accessToken)).expect(409);

      // Talep beklerken sürüm doğrudan yayınlanırsa talep iptal olur.
      const third = await request(server).post(url).set(as(admin.accessToken)).send({ approverId: officer.user.id }).expect(201);
      await request(server).post(`/api/v1/documents/${docId}/versions/${versionId}/publish`).set(as(admin.accessToken)).expect(200);
      await request(server).post(`/api/v1/approval-requests/${third.body.id}/approve`).set(as(officer.accessToken)).send({}).expect(409);
      const stale = await request(server).get(`/api/v1/approval-requests/${third.body.id}`).set(as(admin.accessToken)).expect(200);
      expect(stale.body.status).toBe('cancelled');
      const staleTask = await request(server).get(`/api/v1/tasks/${third.body.taskId}`).set(as(admin.accessToken)).expect(200);
      expect(staleTask.body.status).toBe('cancelled');
      // Yayındaki sürüm için onay istenemez.
      await request(server).post(url).set(as(admin.accessToken)).send({ approverId: officer.user.id }).expect(409);
    });
  });
});
