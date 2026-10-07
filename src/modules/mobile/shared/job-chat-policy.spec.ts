import { containsExternalContact } from './job-chat-policy';

describe('Job chat contact policy', () => {
  it.each([
    '+591 7217-7549',
    '7 2 1 7 7 5 4 9',
    '７２１７７５４９',
    '٧٢١٧٧٥٤٩',
    'siete dos uno siete siete cinco cuatro nueve',
    'hola@example.com',
    'hola arroba example punto com',
    'https://example.shop',
    'example.shop',
    'wa.me/59172177549',
    't.me/micuenta',
    '@miusuario',
    'Escríbeme por WhatsApp',
    'w h a t s a p p',
    'mi Instagram',
    'facebook.com/persona',
    'wsp',
    'Págame por PayPal',
    'Mi cuenta bancaria',
    'Transferencia a mi cuenta',
    'Mi IBAN es ES00',
    'QR de pago',
    'Te paso mi celular',
    'Telegram',
    'wha\u200btsapp',
    'Te cobro fuera de Chamba',
  ])('blocks %s', (text) => expect(containsExternalContact(text)).toBe(true));

  it.each([
    '¿Dónde ingreso?',
    'Cambiar horario',
    'Ya estoy llegando',
    'Tengo un problema',
    'Ingreso por la puerta azul',
    'Calle 12, edificio 45, piso 3',
    'Nos vemos a las 17:30',
    'El precio acordado es Bs 150',
    'Traeré dos herramientas',
    'El pago del trabajo está pendiente',
  ])('allows job coordination: %s', (text) =>
    expect(containsExternalContact(text)).toBe(false),
  );
});
