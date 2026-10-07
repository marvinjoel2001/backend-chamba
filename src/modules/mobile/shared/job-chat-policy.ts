export const CHAT_CONTACT_ALERT =
  'Por tu seguridad, no compartas teléfonos, redes sociales, correos, enlaces ni datos de pagos externos. Coordina este trabajo dentro de Chamba.';

const digitWords: Record<string, string> = {
  cero: '0',
  uno: '1',
  dos: '2',
  tres: '3',
  cuatro: '4',
  cinco: '5',
  seis: '6',
  siete: '7',
  ocho: '8',
  nueve: '9',
};

export function normalizeChatText(content: string): string {
  return content
    .normalize('NFKC')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,
      '',
    )
    .toLowerCase()
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0),
    )
    .replace(/\b(arroba|at sign)\b/g, '@')
    .replace(/\b(punto|dot)\b/g, '.')
    .replace(
      /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
      (word) => digitWords[word],
    );
}

export function containsExternalContact(content: string): boolean {
  const text = normalizeChatText(content);
  const compact = text.replace(/[^a-z0-9]/g, '');
  return (
    /(?:\+?\d[\s().\-/]*){7,}/.test(text) ||
    /@\s*[a-z0-9_]/.test(text) ||
    /(?:https?|ftp):|www\s*\.|(?:wa|t)\s*\.\s*me\b/.test(text) ||
    /\b[a-z0-9-]+\.[a-z]{2,24}\b/.test(text) ||
    /\b[a-z0-9-]+\s*\.\s*(?:com|net|org|io|app|me|co|bo|ly|gg|dev|xyz|info|biz|site|online|social|link|pro|tv|us|uk|es|br|pe|cl|ar|mx|ec)\b/.test(
      text,
    ) ||
    /wh?ats?app|wh?atsap|wasap|guasap|telegram|instagram|facebook|tiktok|snapchat|linkedin|messenger|discord|paypal|binance|mercadopago|westernunion|moneygram|cashapp/.test(
      compact,
    ) ||
    /\b(?:wsp|wpp|whats|insta|ig|fb|yape|plin|usdt|btc|iban|swift|cbu|cvu|sinpe)\b/.test(
      text,
    ) ||
    /\b(?:telefono|celular|correo|email|e-mail|gmail|hotmail|outlook|redes sociales|numero de contacto)\b/.test(
      text,
    ) ||
    /\b(?:cuenta bancaria|numero de cuenta|tarjeta bancaria|pago externo|pagar? (?:por|fuera)|deposit[oa]|transfer(?:encia|ir)|qr (?:de )?pago|fuera de chamba)\b/.test(
      text,
    )
  );
}

export const CHAT_WRITABLE_STATUSES = ['assigned', 'in_progress'];
export const CHAT_HISTORY_STATUSES = [
  ...CHAT_WRITABLE_STATUSES,
  'completed',
  'cancelled',
];
