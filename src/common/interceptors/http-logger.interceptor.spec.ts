import { HttpLoggerInterceptor, sanitizeForLog } from './http-logger.interceptor';

describe('HTTP logging does not expose credentials or photos', () => {
  const logger = new HttpLoggerInterceptor({} as any) as any;
  it('redacts tokens in responses as well as nested input objects', () => {
    expect(logger.previewBody({ token: 'signed-credential', user: { accessToken: 'other', id: 'QA' } }))
      .toBe('{"token":"***","user":{"accessToken":"***","id":"QA"}}');
  });
  it('redacts credentials inside arrays and base64 image collections', () => {
    expect(logger.sanitizeBody({ items: [{ privateKey: 'private', title: 'QA' }], photosBase64: ['large-data'] }))
      .toEqual({ items: [{ privateKey: '***', title: 'QA' }], photosBase64: '***' });
  });
});

describe('sanitizeForLog (logs de peticiones)', () => {
  it('nunca deja fotos del carnet, selfie, claves ni el número de carnet', () => {
    const body = {
      workerUserId: 'w1',
      idPhotoBase64: 'data:image/jpeg;base64,AAAA',
      facePhotoBase64: 'data:image/jpeg;base64,BBBB',
      geminiKey: 'AIza-secreta',
      nvidiaKey: 'nvapi-secreta',
      deepseekKey: 'sk-secreta',
      secretKey: 'sk_live_x',
      ciNumber: '1234567',
      password: 'clave',
      newPassword: 'clave-nueva',
      resetToken: 'jwt',
      user: { idPhotoUrl: 'https://res.cloudinary.com/x/carnet.jpg', firstName: 'Ana' },
    };
    expect(sanitizeForLog(body)).toEqual({
      workerUserId: 'w1',
      idPhotoBase64: '***',
      facePhotoBase64: '***',
      geminiKey: '***',
      nvidiaKey: '***',
      deepseekKey: '***',
      secretKey: '***',
      ciNumber: '***',
      password: '***',
      newPassword: '***',
      resetToken: '***',
      user: { idPhotoUrl: '***', firstName: 'Ana' },
    });
  });

  it('una imagen con otro nombre de campo tampoco se guarda', () => {
    const image = `data:image/png;base64,${'A'.repeat(5000)}`;
    const sanitized = sanitizeForLog({ foto: image, fotos: [image] }) as any;
    expect(sanitized.foto).toBe(`[archivo omitido: ${image.length} caracteres]`);
    expect(sanitized.fotos[0]).toContain('archivo omitido');
  });

  it('recorta textos muy largos y deja los normales', () => {
    const sanitized = sanitizeForLog({ title: 'Pintar sala', blob: 'x'.repeat(2000) }) as any;
    expect(sanitized.title).toBe('Pintar sala');
    expect(sanitized.blob.length).toBeLessThan(120);
    expect(sanitized.blob).toContain('[2000 caracteres]');
  });
});
