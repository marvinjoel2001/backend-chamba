/**
 * Contrato de pagos entre backend y app.
 *
 * La app solo sabe dibujar estas `PaymentAction` y leer estos `PaymentStatus`.
 * Qué banco, pasarela o QR hay detrás lo decide el backend según la
 * configuración del método de pago en el admin, así que cambiar o agregar un
 * proveedor no requiere publicar una versión nueva de la app.
 *
 * ⚠️ No renombrar ni quitar campos/valores: las apps ya instaladas dependen de
 * ellos. Agregar campos nuevos sí es seguro.
 */
export type PaymentAction = 'none' | 'qr' | 'card_sheet' | 'open_url';

export type PaymentStatus =
  | 'not_required'
  | 'pending'
  | 'reported'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

/** Estados con los que el cliente ya puede aceptar la oferta. */
export const PAYABLE_STATUSES: PaymentStatus[] = ['paid', 'reported'];

/** Lo que recibe la app (POST checkout / GET pago). */
export interface PaymentView {
  id: string | null;
  status: PaymentStatus;
  action: PaymentAction;
  amount: number;
  currency: string;
  title: string;
  methodName: string;
  instructions: string | null;
  qr: { imageUrl: string | null; imageBase64: string | null } | null;
  card: {
    clientSecret: string;
    ephemeralKey: string | null;
    customer: string | null;
    publishableKey: string | null;
  } | null;
  url: string | null;
  expiresAt: string | null;
  /** Muestra el botón "Ya pagué" (QR que confirma un humano). */
  canReportPaid: boolean;
  /** Cada cuántos segundos la app vuelve a consultar el estado (0 = no). */
  pollSeconds: number;
}

export interface ProviderContext {
  paymentId: string;
  requestId: string;
  offerId: string;
  clientUserId: string;
  amount: number;
  currency: string | null;
  title: string;
  config: Record<string, any>;
}

export interface ProviderCheckout {
  action: Exclude<PaymentAction, 'none'>;
  status: PaymentStatus;
  currency: string;
  externalId?: string | null;
  expiresAt?: Date | null;
  canReportPaid?: boolean;
  pollSeconds?: number;
  /** Se guarda tal cual y se devuelve a la app (qr, card, url, instructions). */
  payload: {
    instructions?: string | null;
    qr?: PaymentView['qr'];
    card?: PaymentView['card'];
    url?: string | null;
  };
}

export interface StoredPayment {
  id: string;
  external_id: string | null;
  status: PaymentStatus;
  payload: Record<string, any>;
}

/**
 * Un proveedor nuevo (BNB, Libélula, otro banco…) solo implementa esta
 * interfaz y se registra en `PaymentProvidersRegistry`.
 */
export interface PaymentProvider {
  readonly key: string;
  /** Etiqueta para el selector del admin. */
  readonly label: string;
  createCheckout(ctx: ProviderContext): Promise<ProviderCheckout>;
  /** Consulta el estado real en el proveedor; null si no cambió o no aplica. */
  refreshStatus?(
    payment: StoredPayment,
    config: Record<string, any>,
  ): Promise<PaymentStatus | null>;
  /** Avisos del proveedor (webhook): devuelve qué pago cambió y a qué estado. */
  handleWebhook?(
    body: any,
    headers: Record<string, string | string[] | undefined>,
    config: Record<string, any>,
  ): Promise<{ externalId: string; status: PaymentStatus } | null>;
}
