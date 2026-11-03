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
  /** Solo pagos viejos: era el "Ya pagué" del QR fijo, que ya no existe. */
  | 'reported'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  /** Se cobró pero el trabajo no se hizo con ese pago: hay que devolverlo. */
  | 'refund_pending'
  | 'refunded'
  /** El admin revisó el reembolso y decidió no devolverlo (con motivo). */
  | 'refund_declined';

/**
 * Estados con los que el cliente ya puede aceptar la oferta: solo un pago que
 * el proveedor confirmó por su API (webhook o consulta de estado).
 */
export const PAYABLE_STATUSES: PaymentStatus[] = ['paid'];

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
  /**
   * Siempre false: ya no existe "Ya pagué". Se sigue enviando para que las
   * versiones viejas de la app no muestren ese botón.
   */
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
 * Un proveedor nuevo (QR de BNB, Libélula, otro banco…) solo implementa esta
 * interfaz y se registra en `PaymentProvidersRegistry`.
 *
 * El pago se confirma únicamente con la API del proveedor: hay que
 * implementar `refreshStatus`, `handleWebhook` (validando la firma) o ambos.
 * Un proveedor sin ninguno de los dos no se puede usar para cobrar.
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
