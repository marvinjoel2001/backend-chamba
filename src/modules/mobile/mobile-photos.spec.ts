import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccessService } from '../access/access.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MobileService } from './mobile.service';
import { MobileUsersService } from './services/mobile-users.service';

const SECRET = 'test-secret-with-at-least-32-characters';
const OWN =
  'https://res.cloudinary.com/chamba-cloud/image/upload/v1/chamba/requests/abc.jpg';
const OTHER_CLOUD =
  'https://res.cloudinary.com/otra-cuenta/image/upload/v1/x.jpg';
const EXTERNAL = 'https://tracker.example.com/pixel.jpg';

function storage() {
  const service = new StorageService(
    new ConfigService({
      CLOUDINARY_CLOUD_NAME: 'chamba-cloud',
      CLOUDINARY_API_KEY: 'k',
      CLOUDINARY_API_SECRET: 's',
    }),
  );
  jest.spyOn(service, 'uploadBase64Image').mockResolvedValue({
    url: OWN,
    publicId: 'chamba/requests/abc',
  });
  jest.spyOn(service, 'deleteImage').mockResolvedValue(undefined);
  return service;
}

describe('Fotos: el backend solo usa y borra imágenes que él subió', () => {
  const access = new AccessService(
    new JwtService(),
    { get: () => SECRET, getOrThrow: () => SECRET } as any,
    {} as any,
  );

  it('solo acepta URLs de la cuenta de Cloudinary de Chamba', () => {
    const s = storage();
    expect(s.isOwnImageUrl(OWN)).toBe(true);
    expect(s.isOwnImageUrl(OTHER_CLOUD)).toBe(false);
    expect(s.isOwnImageUrl(EXTERNAL)).toBe(false);
    expect(
      s.isOwnImageUrl(
        'http://res.cloudinary.com/chamba-cloud/image/upload/x.jpg',
      ),
    ).toBe(false);
    expect(
      s.isOwnImageUrl(
        'https://user:pw@res.cloudinary.com/chamba-cloud/image/upload/x.jpg',
      ),
    ).toBe(false);
    expect(s.isOwnImageUrl('no es una url')).toBe(false);
  });

  describe('solicitudes', () => {
    let requests: { createRequest: jest.Mock };
    let service: MobileService;
    let files: StorageService;

    beforeEach(() => {
      files = storage();
      requests = { createRequest: jest.fn(async (input) => input) };
      const args: any[] = Array(17).fill({});
      args[2] = files;
      args[6] = { validateBase64Images: (images: string[]) => images };
      args[11] = requests;
      args[14] = access;
      service = new MobileService(
        ...(args as ConstructorParameters<typeof MobileService>),
      );
    });

    it('la foto que sube el backend queda del cliente (con su comprobante) y se puede borrar después', async () => {
      const uploaded = await service.uploadRequestPhoto(
        'cliente-1',
        'data:image/jpeg;base64,AAAA',
      );
      expect(uploaded).toMatchObject({
        url: OWN,
        publicId: 'chamba/requests/abc',
      });

      await service.createRequest({
        clientUserId: 'cliente-1',
        photos: [
          {
            url: 'ignorada',
            publicId: 'otro/id',
            uploadToken: uploaded.uploadToken,
          },
        ],
      } as any);
      expect(requests.createRequest.mock.calls[0][0].photos).toEqual([
        { url: OWN, publicId: 'chamba/requests/abc' },
      ]);
    });

    it('con el comprobante de otro cliente o una foto de versiones viejas, se guarda la URL sin publicId', async () => {
      const ajena = await service.uploadRequestPhoto(
        'otro-cliente',
        'data:image/jpeg;base64,AAAA',
      );
      await service.createRequest({
        clientUserId: 'cliente-1',
        photos: [
          // Intento de reclamar la foto (y luego borrarla) de otra persona.
          {
            url: OWN,
            publicId: 'chamba/profile/de-la-victima',
            uploadToken: ajena.uploadToken,
          },
          // App vieja: subió directo a Cloudinary.
          { url: OWN, publicId: 'chamba/requests/directa' },
        ],
      } as any);
      expect(requests.createRequest.mock.calls[0][0].photos).toEqual([
        { url: OWN, publicId: null },
        { url: OWN, publicId: null },
      ]);
    });

    it.each([EXTERNAL, OTHER_CLOUD, ''])(
      'rechaza una foto que no es de Chamba: %s',
      async (url) => {
        await expect(
          service.createRequest({
            clientUserId: 'cliente-1',
            photos: [{ url, publicId: 'x' }],
          } as any),
        ).rejects.toThrow('no es válida');
        expect(requests.createRequest).not.toHaveBeenCalled();
      },
    );
  });

  describe('foto de perfil', () => {
    const userId = 'u1';
    let db: { query: jest.Mock };
    let files: StorageService;
    let previous: string | null;
    let users: MobileUsersService;

    beforeEach(() => {
      previous = 'chamba/profile/anterior';
      db = { query: jest.fn().mockResolvedValue([]) };
      files = storage();
      const repo = {
        getUserByIdWithPhotoMeta: jest.fn(async () => ({
          id: userId,
          profilePhotoPublicId: previous,
        })),
        getUserById: jest.fn(async () => ({ id: userId })),
      };
      users = new MobileUsersService(
        db as any,
        files,
        {} as any,
        {} as any,
        repo as any,
        {} as any,
      );
    });

    it('versión vieja (URL directa): ignora el publicId que manda la app', async () => {
      await users.uploadProfilePhoto({
        userId,
        imageUrl: OWN,
        imagePublicId: 'chamba/profile/de-la-victima',
      });
      expect(db.query.mock.calls[0][0]).toContain(
        'profile_photo_public_id = NULL',
      );
      expect(db.query.mock.calls[0][1]).toEqual([userId, OWN]);
      // Solo se borra la anterior, que sí subió el backend.
      expect(files.deleteImage).toHaveBeenCalledTimes(1);
      expect(files.deleteImage).toHaveBeenCalledWith('chamba/profile/anterior');
    });

    it('sin una anterior propia no se borra nada', async () => {
      previous = null;
      await users.uploadProfilePhoto({
        userId,
        imageUrl: OWN,
        imagePublicId: 'x',
      });
      expect(files.deleteImage).not.toHaveBeenCalled();
    });

    it('rechaza fotos de fuera de la cuenta de Chamba', async () => {
      await expect(
        users.uploadProfilePhoto({ userId, imageUrl: EXTERNAL }),
      ).rejects.toThrow('no es válida');
      expect(db.query).not.toHaveBeenCalled();
    });

    it('subida por el backend (base64): queda como nuestra', async () => {
      await users.uploadProfilePhoto({
        userId,
        imageBase64: 'data:image/jpeg;base64,AAAA',
      });
      expect(db.query.mock.calls[0][1]).toEqual([
        userId,
        OWN,
        'chamba/requests/abc',
      ]);
    });
  });

  it('un comprobante de subida no sirve como sesión', async () => {
    const ticket = access.issueUploadTicket(
      'cliente-1',
      'chamba/requests/abc',
      OWN,
    );
    await expect(access.authenticate(ticket)).rejects.toMatchObject({
      status: 401,
    });
    expect(access.verifyUploadTicket('basura', 'cliente-1')).toBeNull();
    expect(access.verifyUploadTicket(undefined, 'cliente-1')).toBeNull();
  });
});
