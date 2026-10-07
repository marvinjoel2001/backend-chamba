import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { JobChatPhotoService } from './job-chat-photo.service';

jest.mock('jsqr', () => ({ __esModule: true, default: jest.fn(() => null) }));

describe('Job chat photo review', () => {
  jest.setTimeout(60000);
  beforeEach(() => (jsQR as jest.Mock).mockReturnValue(null));
  async function image(text = '') {
    const png = await sharp(
      Buffer.from(`<svg width="900" height="240" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="240" fill="white"/><text x="30" y="140" font-size="76" font-family="Arial" fill="black">${text}</text></svg>`),
    )
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }
  it('allows a plain job photo and re-encodes it as JPEG', async () => {
    const output = await new JobChatPhotoService().validate(await image());
    expect((await sharp(output).metadata()).format).toBe('jpeg');
  });
  it('blocks a readable phone number with real local OCR', async () => {
    await expect(
      new JobChatPhotoService().validate(await image('72177549')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('blocks QR photos before OCR', async () => {
    (jsQR as jest.Mock).mockReturnValue({ data: 'https://payments.example' });
    await expect(
      new JobChatPhotoService().validate(await image()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects non-images and excessive image payloads', async () => {
    const service = new JobChatPhotoService();
    await expect(
      service.validate('data:text/html;base64,AAAA'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.validate('data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
