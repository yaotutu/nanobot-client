export const SOCKET_DELIVERY_UNKNOWN = 'delivery_unknown';

export class SocketDeliveryUnknownError extends Error {
  readonly code = SOCKET_DELIVERY_UNKNOWN;

  constructor() {
    super(SOCKET_DELIVERY_UNKNOWN);
    this.name = 'SocketDeliveryUnknownError';
  }
}

export function isSocketDeliveryUnknownError(caught: unknown): caught is SocketDeliveryUnknownError {
  return caught instanceof SocketDeliveryUnknownError
    || (caught instanceof Error
      && (caught as Error & { code?: string }).code === SOCKET_DELIVERY_UNKNOWN);
}
