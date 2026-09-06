import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * An integration has no usable credential (neither env var nor admin-settings row).
 * Surfaces as 503 so the caller can tell "not configured yet" apart from "broken".
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(serviceName: string, envKey: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'service_unconfigured',
        service: serviceName,
        envKey,
        message: `${serviceName} is not configured yet. An administrator can add its credentials under Admin → Services.`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/** An integration is configured but the remote call failed. Also 503 — retryable. */
export class ServiceUnavailableError extends HttpException {
  constructor(serviceName: string, detail: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'service_unavailable',
        service: serviceName,
        message: `${serviceName} did not respond. Nothing was charged — please try again in a moment.`,
        detail,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
