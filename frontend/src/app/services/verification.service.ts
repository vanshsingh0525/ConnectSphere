import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CreateVerificationOrderRequest {
  amountInPaise: number;
  currency: string;
  planName: string;
  validityDays: number;
}

export interface CreateVerificationOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  key: string;
  planName: string;
}

export interface VerifyPaymentRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface PaymentStatusResponse {
  success?: boolean;
  userId: number;
  verified: boolean;
  status: string;
  message?: string;
  planName: string;
  expiryDate: string;
}

@Injectable({
  providedIn: 'root',
})
export class VerificationService {
  private readonly paymentsBaseUrl = `${environment.apiGatewayUrl}/api/payments`;
  private readonly directPaymentsBaseUrl = 'http://localhost:8091/api/payments';

  constructor(private readonly http: HttpClient) {}

  createOrder(payload: CreateVerificationOrderRequest): Observable<CreateVerificationOrderResponse> {
    return this.http.post<CreateVerificationOrderResponse>(`${this.paymentsBaseUrl}/create-order`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.post<CreateVerificationOrderResponse>(`${this.directPaymentsBaseUrl}/create-order`, payload, {
          headers: this.authHeaders(),
        });
      }),
    );
  }

  verify(payload: VerifyPaymentRequest): Observable<PaymentStatusResponse> {
    return this.http.post<PaymentStatusResponse>(`${this.paymentsBaseUrl}/verify`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.post<PaymentStatusResponse>(`${this.directPaymentsBaseUrl}/verify`, payload, {
          headers: this.authHeaders(),
        });
      }),
    );
  }

  getStatus(userId: number): Observable<PaymentStatusResponse> {
    return this.http.get<PaymentStatusResponse>(`${this.paymentsBaseUrl}/status/${userId}`, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.get<PaymentStatusResponse>(`${this.directPaymentsBaseUrl}/status/${userId}`, {
          headers: this.authHeaders(),
        });
      }),
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }

  private shouldRetryDirect(error: HttpErrorResponse): boolean {
    return error.status === 0 || error.status === 404 || error.status === 502 || error.status === 503 || error.status === 504;
  }
}
