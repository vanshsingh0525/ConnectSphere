import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AdminReport {
  id: number;
  reporterUserId?: number;
  targetType: 'USER' | 'POST' | 'COMMENT' | string;
  targetId: number;
  reason: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'REMOVED' | string;
  resolvedByAdminId?: number | null;
  resolutionAction?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly baseUrl = `${environment.apiGatewayUrl}/admin`;

  constructor(private readonly http: HttpClient) {}

  getUsers(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/users`, { headers: this.authHeaders() });
  }

  updateUserStatus(userId: number, status: string): Observable<Record<string, unknown>> {
    return this.http.patch<Record<string, unknown>>(`${this.baseUrl}/users/${userId}/status`, { status }, { headers: this.authHeaders() });
  }

  deleteUser(userId: number): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(`${this.baseUrl}/users/${userId}`, { headers: this.authHeaders() });
  }

  getPosts(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/posts`, { headers: this.authHeaders() });
  }

  deletePost(postId: number): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(`${this.baseUrl}/posts/${postId}`, { headers: this.authHeaders() });
  }

  flagPost(postId: number, flagged: boolean): Observable<Record<string, unknown>> {
    return this.http.patch<Record<string, unknown>>(`${this.baseUrl}/posts/${postId}/flag?flagged=${flagged}`, {}, { headers: this.authHeaders() });
  }

  getComments(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/comments`, { headers: this.authHeaders() });
  }

  deleteComment(commentId: number): Observable<Record<string, unknown>> {
    return this.http.delete<Record<string, unknown>>(`${this.baseUrl}/comments/${commentId}`, { headers: this.authHeaders() });
  }

  getReports(): Observable<AdminReport[]> {
    return this.http.get<AdminReport[]>(`${this.baseUrl}/reports`, { headers: this.authHeaders() });
  }

  resolveReport(reportId: number, action: string): Observable<AdminReport> {
    return this.http.patch<AdminReport>(`${this.baseUrl}/reports/${reportId}/resolve`, { action }, { headers: this.authHeaders() });
  }

  getFlaggedPosts(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/moderation/flagged-posts`, { headers: this.authHeaders() });
  }

  getAnalytics(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.baseUrl}/analytics`, { headers: this.authHeaders() });
  }

  getHashtags(q = '', size = 20): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/hashtags?q=${encodeURIComponent(q)}&size=${size}`, { headers: this.authHeaders() });
  }

  sendBroadcast(message: string, userIds: number[] = []): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/notifications/send`, { message, userIds }, { headers: this.authHeaders() });
  }

  getAuditLogs(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${this.baseUrl}/audit-logs`, { headers: this.authHeaders() }).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 404) {
          return of([]);
        }
        return throwError(() => error);
      }),
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({ Authorization: `Bearer ${accessToken ?? ''}` });
  }
}
