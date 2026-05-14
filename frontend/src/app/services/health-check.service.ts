import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

import { ServiceState, ServiceStatus } from '../models/service-status.model';

interface ServiceConfig {
  name: string;
  baseUrl: string;
  endpoint: string;
}

@Injectable({
  providedIn: 'root',
})
export class HealthCheckService {
  private readonly services: ServiceConfig[] = [
    { name: 'Discovery Server', baseUrl: 'http://localhost:8761', endpoint: '/actuator/health' },
    { name: 'Auth Service', baseUrl: 'http://localhost:8081', endpoint: '/actuator/health' },
  ];

  constructor(private readonly http: HttpClient) {}

  checkAll(): Observable<ServiceStatus[]> {
    return forkJoin(this.services.map((service) => this.checkService(service)));
  }

  private checkService(service: ServiceConfig): Observable<ServiceStatus> {
    const start = performance.now();
    return this.http
      .get<unknown>(`${service.baseUrl}${service.endpoint}`, { observe: 'response' })
      .pipe(
        map((response) => this.toSuccessStatus(service, response, start)),
        catchError((error: unknown) => of(this.toErrorStatus(service, error, start))),
      );
  }

  private toSuccessStatus(service: ServiceConfig, response: HttpResponse<unknown>, start: number): ServiceStatus {
    const state = this.resolveStateFromBody(response.body);
    return {
      name: service.name,
      baseUrl: service.baseUrl,
      endpoint: service.endpoint,
      state,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - start),
      message: state === 'UP' ? 'Service healthy' : 'Service responded with non-UP state',
      checkedAt: new Date().toLocaleTimeString(),
    };
  }

  private toErrorStatus(service: ServiceConfig, error: unknown, start: number): ServiceStatus {
    let statusCode: number | undefined;
    let message = 'Service unreachable';

    if (typeof error === 'object' && error !== null) {
      const maybe = error as { status?: number; message?: string };
      statusCode = maybe.status;
      if (maybe.message) {
        message = maybe.message;
      }
    }

    return {
      name: service.name,
      baseUrl: service.baseUrl,
      endpoint: service.endpoint,
      state: 'DOWN',
      statusCode,
      latencyMs: Math.round(performance.now() - start),
      message,
      checkedAt: new Date().toLocaleTimeString(),
    };
  }

  private resolveStateFromBody(body: unknown): ServiceState {
    if (!body || typeof body !== 'object') {
      return 'UNKNOWN';
    }

    const maybeStatus = (body as { status?: unknown }).status;
    if (typeof maybeStatus !== 'string') {
      return 'UNKNOWN';
    }

    if (maybeStatus.toUpperCase() === 'UP') {
      return 'UP';
    }

    if (maybeStatus.toUpperCase() === 'DOWN') {
      return 'DOWN';
    }

    return 'UNKNOWN';
  }
}
