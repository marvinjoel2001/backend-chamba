import { HttpLoggerInterceptor } from './http-logger.interceptor';
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
