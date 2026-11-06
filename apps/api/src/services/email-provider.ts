import { env } from '../config/env.js';

export type ProviderEmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type DeliveryResult = {
  accepted: boolean;
  retryable: boolean;
  errorCode: string | null;
  providerMessageId: string | null;
  providerStatus: number | null;
  attempts: number;
};

export type EmailProviderConfiguration = {
  apiUrl: string;
  apiKey: string | undefined;
  fromAddress: string | undefined;
};

export async function deliverEmail(
  message: ProviderEmailMessage,
  fetcher: typeof fetch = fetch,
  configuration: EmailProviderConfiguration = {
    apiUrl: env.EMAIL_PROVIDER_API_URL,
    apiKey: env.EMAIL_PROVIDER_API_KEY,
    fromAddress: env.EMAIL_FROM_ADDRESS,
  },
): Promise<DeliveryResult> {
  if (!configuration.apiKey || !configuration.fromAddress)
    return {
      accepted: false,
      retryable: true,
      errorCode: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      providerMessageId: null,
      providerStatus: null,
      attempts: 0,
    };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(configuration.apiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
       headers: {
  'api-key': configuration.apiKey,
  'content-type': 'application/json',
  accept: 'application/json',
},
        body: JSON.stringify({
          from: configuration.fromAddress,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          id?: unknown;
        } | null;
        return {
          accepted: true,
          retryable: false,
          errorCode: null,
          providerMessageId:
            typeof payload?.id === 'string' ? payload.id.slice(0, 160) : null,
          providerStatus: response.status,
          attempts: attempt + 1,
        };
      }
      const retryable = response.status >= 500 || response.status === 429;
      if (retryable && attempt === 0) continue;
      return {
        accepted: false,
        retryable,
        errorCode: `EMAIL_PROVIDER_${response.status}`,
        providerMessageId: null,
        providerStatus: response.status,
        attempts: attempt + 1,
      };
    } catch {
      if (attempt === 0) continue;
      return {
        accepted: false,
        retryable: true,
        errorCode: 'EMAIL_PROVIDER_UNAVAILABLE',
        providerMessageId: null,
        providerStatus: null,
        attempts: attempt + 1,
      };
    }
  }
  return {
    accepted: false,
    retryable: true,
    errorCode: 'EMAIL_PROVIDER_UNAVAILABLE',
    providerMessageId: null,
    providerStatus: null,
    attempts: 0,
  };
}
