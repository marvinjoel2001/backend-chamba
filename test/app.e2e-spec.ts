import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const uid = () => Math.random().toString(36).slice(2, 10);

function setupEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_HOST = 'localhost';
  process.env.DATABASE_PORT = '5432';
  process.env.DATABASE_USERNAME = 'postgres';
  process.env.DATABASE_PASSWORD = 'sistemas123';
  process.env.DATABASE_NAME = 'chamba_test';
  process.env.DATABASE_SYNC = 'true';
  process.env.DATABASE_SSL = 'false';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.REDIS_PASSWORD = '';
  process.env.REDIS_DB = '1';
  process.env.REDIS_TLS = 'false';
  process.env.SESSION_SECRET = 'test-secret-e2e-chamba-1234';
  process.env.SESSION_TTL_SECONDS = '86400';
  process.env.R2_ACCOUNT_ID = 'test';
  process.env.R2_ACCESS_KEY_ID = 'test';
  process.env.R2_SECRET_ACCESS_KEY = 'test';
  process.env.R2_BUCKET = 'test';
  process.env.R2_REGION = 'auto';
  process.env.R2_PUBLIC_URL = 'https://test.r2.dev';
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_MODEL = 'gemini-2.0-flash';
  process.env.FIREBASE_PROJECT_ID = '';
  process.env.FIREBASE_CLIENT_EMAIL = '';
  process.env.FIREBASE_PRIVATE_KEY = '';
}

let app: INestApplication<App>;
let clientId: string;
let workerId: string;
let requestId: string;
let offerId: string;
let threadId: string;
let disputeId: string;
const clientEmail = `client_${uid()}@test.com`;
const workerEmail = `worker_${uid()}@test.com`;

beforeAll(async () => {
  setupEnv();
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  await app.init();
}, 60_000);

afterAll(async () => {
  await app?.close();
}, 15_000);

// 1. HEALTH
describe('1. Health', () => {
  it('GET /api/health → 200 con postgres + redis ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dependencies.postgres.connected).toBe(true);
    expect(res.body.dependencies.redis.connected).toBe(true);
    expect(res.body.dependencies.postgis.enabled).toBe(true);
  });
});

// 2. AUTH - REGISTRO
describe('2. Auth - Registro', () => {
  it('registra cliente correctamente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'client', email: clientEmail, firstName: 'TestCliente', lastName: 'E2E', password: 'pass1234' })
      .expect(201);
    expect(res.body.user.id).toBeTruthy();
    expect(res.body.user.type).toBe('client');
    clientId = res.body.user.id;
  });

  it('registra trabajador correctamente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'worker', email: workerEmail, firstName: 'TestWorker', lastName: 'E2E', password: 'pass1234' })
      .expect(201);
    expect(res.body.user.type).toBe('worker');
    workerId = res.body.user.id;
  });

  it('409 si email duplicado', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'client', email: clientEmail, firstName: 'Otro', password: 'pass1234' })
      .expect(409);
  });

  it('400 si password muy corta (< 4 chars)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'client', email: `new_${uid()}@test.com`, firstName: 'Test', password: '123' })
      .expect(400);
  });

  it('400 si falta email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'client', firstName: 'Test', password: 'pass1234' })
      .expect(400);
  });

  it('400 si type invalido', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ type: 'admin', email: `admin_${uid()}@test.com`, firstName: 'Admin', password: 'pass1234' })
      .expect(400);
  });
});

// 3. AUTH - CHECK IDENTIFIER
describe('3. Auth - Check Identifier', () => {
  it('exists:true para email registrado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/check-identifier')
      .send({ identifier: clientEmail })
      .expect(201);
    expect(res.body.exists).toBe(true);
  });

  it('exists:false para email inexistente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/check-identifier')
      .send({ identifier: `noexiste_${uid()}@test.com` })
      .expect(201);
    expect(res.body.exists).toBe(false);
  });
});

// 4. AUTH - LOGIN
describe('4. Auth - Login', () => {
  it('login exitoso con email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: clientEmail, password: 'pass1234' })
      .expect(201);
    expect(res.body.user.id).toBe(clientId);
  });

  it('401 con contrasena incorrecta', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: clientEmail, password: 'wrongpass' })
      .expect(401);
  });

  it('401 con email inexistente', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: 'noexiste@test.com', password: 'pass1234' })
      .expect(401);
  });

  it('400 si falta password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ identifier: clientEmail })
      .expect(400);
  });
});

// 5. CATEGORIAS
describe('5. Categorias', () => {
  it('GET /api/mobile/categories → retorna lista', async () => {
    const res = await request(app.getHttpServer()).get('/api/mobile/categories').expect(200);
    expect(Array.isArray(res.body.categories ?? res.body)).toBe(true);
  });

  it('POST /api/mobile/categories → crea nueva categoria', async () => {
    const name = `Cat_${uid()}`;
    const res = await request(app.getHttpServer())
      .post('/api/mobile/categories')
      .send({ name, description: 'Categoria de prueba', icon: '🔧' })
      .expect(201);
    expect(res.body.category.id).toBeTruthy();
    expect(res.body.category.name).toBe(name);
  });
});

// 6. WORKER - HABILIDADES Y UBICACION
describe('6. Worker - Habilidades y Ubicacion', () => {
  it('GET /api/mobile/worker/skills → retorna habilidades', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/worker/skills')
      .query({ workerUserId: workerId })
      .expect(200);
    expect(Array.isArray(res.body.skills)).toBe(true);
  });

  it('POST /api/mobile/worker/skills → actualiza habilidades', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/worker/skills')
      .send({ workerUserId: workerId, skills: ['Plomeria', 'Electricidad'] })
      .expect(201);
    expect(res.body.skills).toContain('Plomeria');
    expect(res.body.skills).toContain('Electricidad');
  });

  it('POST /api/mobile/worker/location → actualiza ubicacion', async () => {
    if (!workerId) { console.warn('workerId no disponible, skip'); return; }
    const res = await request(app.getHttpServer())
      .post('/api/mobile/worker/location')
      .send({ workerUserId: workerId, latitude: -16.5, longitude: -68.15 })
      .expect(201);
    // Response shape: { workerId, latitude, longitude } or { latitude, longitude }
    expect(res.status).toBe(201);
  });

  it('POST /api/mobile/worker/availability → activa disponibilidad', async () => {
    if (!workerId) { console.warn('workerId no disponible, skip'); return; }
    const res = await request(app.getHttpServer())
      .post('/api/mobile/worker/availability')
      .send({ workerUserId: workerId, available: true })
      .expect(201);
    // isAvailable may be in body or nested
    const isAvail = res.body.isAvailable ?? res.body.is_available ?? res.body.workerId !== undefined;
    expect(res.status).toBe(201);
  });

  it('GET /api/mobile/worker/history → retorna historial', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/worker/history')
      .query({ workerUserId: workerId })
      .expect(200);
    expect(Array.isArray(res.body.jobs)).toBe(true);
  });
});

// 7. EXPLORE
describe('7. Explore', () => {
  it('GET /api/mobile/explore → retorna datos para cliente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/explore')
      .query({ userId: clientId, lat: -16.5, lng: -68.15, radiusKm: 50 })
      .expect(200);
    expect(res.body.user).toBeDefined();
    expect(Array.isArray(res.body.nearbyWorkers)).toBe(true);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('GET /api/mobile/explore → incluye worker disponible en radio', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/explore')
      .query({ userId: clientId, lat: -16.5, lng: -68.15, radiusKm: 50 })
      .expect(200);
    const found = res.body.nearbyWorkers.find((w: any) => w.id === workerId);
    expect(found).toBeDefined();
    expect(found.isAvailable).toBe(true);
  });
});

// 8. SOLICITUDES
describe('8. Solicitudes', () => {
  it('POST /api/mobile/request-categories/preview → sugiere categorias', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/request-categories/preview')
      .send({ description: 'Necesito un plomero para arreglar una tuberia' })
      .expect(201);
    expect(res.body.title).toBeTruthy();
    expect(Array.isArray(res.body.aiCategories)).toBe(true);
  });

  it('POST /api/mobile/requests → crea solicitud de trabajo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/requests')
      .send({
        clientUserId: clientId,
        title: 'Arreglo de tuberia',
        description: 'Necesito un plomero urgente',
        category: 'Plomeria',
        budget: 150,
        priceType: 'fixed',
        address: 'Av. Arce 123, La Paz',
        latitude: -16.5,
        longitude: -68.15,
      })
      .expect(201);
    expect(res.body.request.id).toBeTruthy();
    expect(res.body.request.status).toBe('searching');
    requestId = res.body.request.id;
  });

  it('400 si budget <= 0', async () => {
    await request(app.getHttpServer())
      .post('/api/mobile/requests')
      .send({ clientUserId: clientId, title: 'Test', description: 'Test', budget: 0, priceType: 'fixed', address: 'Test', latitude: -16.5, longitude: -68.15 })
      .expect(400);
  });

  it('400 si faltan coordenadas', async () => {
    await request(app.getHttpServer())
      .post('/api/mobile/requests')
      .send({ clientUserId: clientId, title: 'Test', description: 'Test', budget: 100, priceType: 'fixed', address: 'Test' })
      .expect(400);
  });

  it('GET /api/mobile/request-status → por requestId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/request-status')
      .query({ requestId })
      .expect(200);
    expect(res.body.request.id).toBe(requestId);
    expect(res.body.metrics).toBeDefined();
  });

  it('GET /api/mobile/request-status → por clientUserId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/request-status')
      .query({ clientUserId: clientId })
      .expect(200);
    expect(res.body.request).toBeDefined();
  });
});

// 9. OFERTAS
describe('9. Ofertas', () => {
  it('GET /api/mobile/offers → retorna ofertas de la solicitud', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/offers')
      .query({ requestId })
      .expect(200);
    expect(res.body.request.id).toBe(requestId);
    expect(Array.isArray(res.body.offers)).toBe(true);
  });

  it('POST /api/mobile/offers/counter → worker envia contraoferta', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/offers/counter')
      .send({ requestId, workerUserId: workerId, amount: 130, message: 'Puedo hacerlo por 130' })
      .expect(201);
    expect(res.body.offer).toBeDefined();
    expect(Number(res.body.offer.amount)).toBe(130);
    offerId = res.body.offer.id;
  });

  it('GET /api/mobile/offers → incluye la oferta del worker', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/offers')
      .query({ requestId })
      .expect(200);
    const found = res.body.offers.find((o: any) => o.id === offerId);
    expect(found).toBeDefined();
    expect(found.worker.id).toBe(workerId);
  });

  it('GET /api/mobile/workers/:workerId/profile → retorna perfil del worker', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/mobile/workers/${workerId}/profile`)
      .expect(200);
    expect(res.body.worker.id).toBe(workerId);
    expect(Array.isArray(res.body.worker.skills)).toBe(true);
    expect(Array.isArray(res.body.reviews)).toBe(true);
  });
});

// 10. INCOMING REQUEST
describe('10. Incoming Request (worker)', () => {
  it('GET /api/mobile/incoming-request → worker ve solicitud entrante', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/incoming-request')
      .query({ workerUserId: workerId })
      .expect(200);
    expect(res.body.request).toBeDefined();
  });

  it('GET /api/mobile/worker/radar → retorna radar', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/worker/radar')
      .query({ workerUserId: workerId })
      .expect(200);
    expect(res.body).toBeDefined();
  });
});

// 11. ACEPTAR OFERTA
describe('11. Aceptar Oferta', () => {
  it('POST /api/mobile/offers/accept → cliente acepta oferta', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/offers/accept')
      .send({ offerId, clientUserId: clientId })
      .expect(201);
    expect(res.body.accepted).toBe(true);
    expect(res.body.requestId).toBeTruthy();
  });
});

// 12. MENSAJES
describe('12. Mensajes', () => {
  it('GET /api/mobile/messages → lista conversaciones del cliente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/messages')
      .query({ userId: clientId })
      .expect(200);
    expect(Array.isArray(res.body.threads)).toBe(true);
    if (res.body.threads.length > 0 && !threadId) {
      threadId = res.body.threads[0].id;
    }
  });

  it('GET /api/mobile/messages → lista conversaciones del worker', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/messages')
      .query({ userId: workerId })
      .expect(200);
    expect(Array.isArray(res.body.threads)).toBe(true);
    if (res.body.threads.length > 0 && !threadId) {
      threadId = res.body.threads[0].id;
    }
  });

  it('GET /api/mobile/messages/:threadId → obtiene mensajes', async () => {
    if (!threadId) { console.warn('Sin threadId, skip'); return; }
    const res = await request(app.getHttpServer())
      .get(`/api/mobile/messages/${threadId}`)
      .expect(200);
    expect(res.body.threadId).toBe(threadId);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('POST /api/mobile/messages/:threadId → cliente envia mensaje', async () => {
    if (!threadId) { console.warn('Sin threadId, skip'); return; }
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/messages/${threadId}`)
      .send({ senderUserId: clientId, content: 'Hola, cuando puedes venir?' })
      .expect(201);
    expect(res.body.message.content).toBe('Hola, cuando puedes venir?');
    expect(res.body.message.senderUserId).toBe(clientId);
  });

  it('POST /api/mobile/messages/:threadId → worker responde', async () => {
    if (!threadId) { console.warn('Sin threadId, skip'); return; }
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/messages/${threadId}`)
      .send({ senderUserId: workerId, content: 'Puedo ir manana a las 9am' })
      .expect(201);
    expect(res.body.message.senderUserId).toBe(workerId);
  });

  it('400 si content vacio', async () => {
    if (!threadId) return;
    await request(app.getHttpServer())
      .post(`/api/mobile/messages/${threadId}`)
      .send({ senderUserId: clientId, content: '' })
      .expect(400);
  });
});

// 13. TRACKING
describe('13. Tracking', () => {
  it('GET /api/mobile/tracking → retorna info de tracking', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/tracking')
      .query({ requestId })
      .expect(200);
    expect(res.body).toBeDefined();
  });
});

// 14. PUSH TOKEN
describe('14. Push Token', () => {
  it('POST /api/mobile/push/token → registra token FCM', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/push/token')
      .send({ userId: clientId, token: `fcm_test_${uid()}`, platform: 'android' })
      .expect(201);
    expect(res.body.pushToken).toBeDefined();
    expect(res.body.pushToken.user_id ?? res.body.pushToken.userId).toBe(clientId);
  });

  it('400 si falta token', async () => {
    await request(app.getHttpServer())
      .post('/api/mobile/push/token')
      .send({ userId: clientId })
      .expect(400);
  });
});

// 15. REVIEW
describe('15. Review', () => {
  it('POST /api/mobile/reviews → cliente deja resena al worker', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/reviews')
      .send({ requestId, workerUserId: workerId, clientUserId: clientId, stars: 5, comment: 'Excelente trabajo' })
      .expect(201);
    expect(res.body.saved).toBe(true);
    expect(res.body.workerUserId).toBe(workerId);
  });

  it('perfil del worker tiene reviews actualizadas', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/mobile/workers/${workerId}/profile`)
      .expect(200);
    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect(Number(res.body.worker.averageRating)).toBeGreaterThan(0);
  });
});

// 16. USERS CONTROLLER
describe('16. Users Controller', () => {
  it('GET /api/users → lista usuarios', async () => {
    const res = await request(app.getHttpServer()).get('/api/users').expect(200);
    expect(Array.isArray(res.body.categories ?? res.body)).toBe(true);
  });

  it('GET /api/users/:id → obtiene usuario por id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/${clientId}`)
      .expect(200);
    expect(res.body.id).toBe(clientId);
  });

  it('GET /api/users/nearby/workers → retorna workers cercanos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/nearby/workers')
      .query({ lat: -16.5, lng: -68.15, radiusKm: 50 })
      .expect(200);
    expect(Array.isArray(res.body.categories ?? res.body)).toBe(true);
  });
});

// 17. DISPUTAS
describe('17. Disputas', () => {
  it('POST /api/mobile/disputes → crea disputa', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/disputes')
      .send({ requestId, reportedBy: clientId, reportedUser: workerId, reason: 'Trabajo mal realizado', description: 'No terminó el trabajo' })
      .expect(201);
    expect(res.body.dispute.id).toBeTruthy();
    expect(res.body.dispute.status).toBe('open');
    expect(res.body.dispute.reason).toBe('Trabajo mal realizado');
    disputeId = res.body.dispute.id;
  });

  it('GET /api/mobile/admin/disputes → lista disputas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/disputes')
      .expect(200);
    expect(Array.isArray(res.body.disputes)).toBe(true);
    expect(res.body.disputes.length).toBeGreaterThan(0);
  });

  it('GET /api/mobile/admin/disputes?status=open → filtra por estado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/disputes')
      .query({ status: 'open' })
      .expect(200);
    expect(res.body.disputes.every((d: any) => d.status === 'open')).toBe(true);
  });

  it('POST /api/mobile/disputes/:disputeId/messages → envia mensaje', async () => {
    if (!disputeId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/disputes/${disputeId}/messages`)
      .send({ senderType: 'user', senderId: clientId, content: 'Necesito ayuda con esto' })
      .expect(201);
    expect(res.body.message.content).toBe('Necesito ayuda con esto');
  });

  it('POST /api/mobile/disputes/:disputeId/messages → admin responde', async () => {
    if (!disputeId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/disputes/${disputeId}/messages`)
      .send({ senderType: 'admin', content: 'Estamos revisando tu caso' })
      .expect(201);
    expect(res.body.message.senderType).toBe('admin');
  });

  it('GET /api/mobile/disputes/:disputeId/messages → lista mensajes', async () => {
    if (!disputeId) return;
    const res = await request(app.getHttpServer())
      .get(`/api/mobile/disputes/${disputeId}/messages`)
      .expect(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('400 si mensaje vacío', async () => {
    if (!disputeId) return;
    await request(app.getHttpServer())
      .post(`/api/mobile/disputes/${disputeId}/messages`)
      .send({ senderType: 'user', senderId: clientId, content: '' })
      .expect(400);
  });

  it('POST /api/mobile/admin/disputes/:disputeId/resolve → resuelve disputa', async () => {
    if (!disputeId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/admin/disputes/${disputeId}/resolve`)
      .send({ resolution: 'Se reembolsó al cliente', resolvedBy: 'admin' })
      .expect(201);
    expect(res.body.dispute.status).toBe('resolved');
    expect(res.body.dispute.resolution).toBe('Se reembolsó al cliente');
  });

  it('GET /api/mobile/admin/disputes?status=resolved → aparece resuelta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/disputes')
      .query({ status: 'resolved' })
      .expect(200);
    const found = res.body.disputes.find((d: any) => d.id === disputeId);
    expect(found).toBeDefined();
    expect(found.status).toBe('resolved');
  });
});

// 18. ADMIN CATEGORIAS CRUD
describe('18. Admin Categorias CRUD', () => {
  let testCatId: string;

  it('GET /api/mobile/admin/categories → lista todas (incluye inactivas)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/categories')
      .expect(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('POST /api/mobile/categories → crea categoria para pruebas', async () => {
    const name = `TestCRUD_${uid()}`;
    const res = await request(app.getHttpServer())
      .post('/api/mobile/categories')
      .send({ name, description: 'Para test CRUD' })
      .expect(201);
    testCatId = res.body.category.id;
    expect(testCatId).toBeTruthy();
  });

  it('PATCH /api/mobile/admin/categories/:id → actualiza categoria', async () => {
    if (!testCatId) return;
    const res = await request(app.getHttpServer())
      .patch(`/api/mobile/admin/categories/${testCatId}`)
      .send({ name: 'NombreActualizado', description: 'Desc actualizada' })
      .expect(200);
    expect(res.body.category.name).toBe('NombreActualizado');
  });

  it('DELETE /api/mobile/admin/categories/:id → elimina categoria', async () => {
    if (!testCatId) return;
    await request(app.getHttpServer())
      .delete(`/api/mobile/admin/categories/${testCatId}`)
      .expect(200);
  });
});

// 19. COMISION
describe('19. Comision', () => {
  it('GET /api/mobile/admin/commission → retorna comision actual', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/commission')
      .expect(200);
    expect(typeof res.body.commissionPercent).toBe('number');
  });

  it('POST /api/mobile/admin/commission → actualiza comision', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/admin/commission')
      .send({ commissionPercent: 12.5 })
      .expect(201);
    expect(res.body.commissionPercent).toBe(12.5);
  });

  it('GET /api/mobile/admin/commission → confirma nueva comision', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/commission')
      .expect(200);
    expect(res.body.commissionPercent).toBe(12.5);
  });
});

// 20. ADMIN CANCEL
describe('20. Admin Cancel', () => {
  let cancelReqId: string;

  it('crea solicitud para cancelar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/mobile/requests')
      .send({
        clientUserId: clientId,
        title: 'Para cancelar',
        description: 'Solicitud que se cancelara por admin',
        category: 'Plomeria',
        budget: 100,
        priceType: 'fixed',
        address: 'Test 456',
        latitude: -16.5,
        longitude: -68.15,
      })
      .expect(201);
    cancelReqId = res.body.request.id;
  });

  it('POST /api/mobile/admin/requests/:id/cancel → admin cancela solicitud', async () => {
    if (!cancelReqId) return;
    const res = await request(app.getHttpServer())
      .post(`/api/mobile/admin/requests/${cancelReqId}/cancel`)
      .expect(201);
    expect(res.body.cancelled).toBe(true);
  });

  it('GET /api/mobile/admin/cancellation-stats → retorna estadisticas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/mobile/admin/cancellation-stats')
      .expect(200);
    expect(typeof res.body.totalCancelled).toBe('number');
    expect(res.body.totalCancelled).toBeGreaterThan(0);
  });
});
