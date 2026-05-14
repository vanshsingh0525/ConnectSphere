import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export type ReactionTargetType = 'POST' | 'COMMENT' | 'STORY';
export type ReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export interface ReactionStatusResponse {
  isReacted: boolean;
  reactionType: ReactionType | null;
}

export interface ReactionSummaryResponse {
  total: number;
  counts: Partial<Record<ReactionType, number>>;
}

export interface UserPostReactionResponse {
  postId: number;
  reactionType: ReactionType;
  reactedAt: string;
}

export interface ReactionUserResponse {
  userId: number;
  reactionType: ReactionType;
  reactedAt: string;
}

interface ReactionUpsertRequest {
  targetId: number;
  targetType: ReactionTargetType;
  reactionType: ReactionType;
}

interface ReactionDeleteRequest {
  targetId: number;
  targetType: ReactionTargetType;
}

@Injectable({
  providedIn: 'root',
})
export class ReactionService {
  private readonly gatewayReactionsApiBaseUrl = `${environment.apiGatewayUrl}/api/v1/likes`;
  private readonly alternateGatewayReactionsApiBaseUrl = `${environment.apiGatewayUrl}/api/reactions`;
  private readonly directReactionsApiBaseUrl = 'http://localhost:8084/api/v1/likes';

  constructor(private readonly http: HttpClient) {}

  addReaction(targetId: number, targetType: ReactionTargetType = 'POST', reactionType: ReactionType = 'LIKE'): Observable<unknown> {
    const payload: ReactionUpsertRequest = {
      targetId,
      targetType,
      reactionType,
    };

    return this.http.post(this.gatewayReactionsApiBaseUrl, payload, { headers: this.authHeaders() }).pipe(
      catchError((primaryError) =>
        this.http.post(this.alternateGatewayReactionsApiBaseUrl, payload, { headers: this.authHeaders() }).pipe(
          catchError((secondaryError) =>
            this.http.post(this.directReactionsApiBaseUrl, payload, { headers: this.authHeaders() }).pipe(
              catchError(() => throwError(() => secondaryError ?? primaryError)),
            ),
          ),
        ),
      ),
    );
  }

  removeReaction(targetId: number, targetType: ReactionTargetType = 'POST'): Observable<unknown> {
    const payload: ReactionDeleteRequest = {
      targetId,
      targetType,
    };

    return this.http.delete(this.gatewayReactionsApiBaseUrl, {
      headers: this.authHeaders(),
      body: payload,
    }).pipe(
      catchError((primaryError) =>
        this.http.delete(this.alternateGatewayReactionsApiBaseUrl, {
          headers: this.authHeaders(),
          body: payload,
        }).pipe(
          catchError((secondaryError) =>
            this.http.delete(this.directReactionsApiBaseUrl, {
              headers: this.authHeaders(),
              body: payload,
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  getStatus(targetId: number, targetType: ReactionTargetType = 'POST'): Observable<ReactionStatusResponse> {
    let params = new HttpParams();
    params = params.set('targetId', targetId);
    params = params.set('targetType', targetType);

    return this.http.get<ReactionStatusResponse>(`${this.gatewayReactionsApiBaseUrl}/status`, {
      headers: this.authHeaders(),
      params,
    }).pipe(
      catchError((primaryError) =>
        this.http.get<ReactionStatusResponse>(`${this.alternateGatewayReactionsApiBaseUrl}/status`, {
          headers: this.authHeaders(),
          params,
        }).pipe(
          catchError((secondaryError) =>
            this.http.get<ReactionStatusResponse>(`${this.directReactionsApiBaseUrl}/status`, {
              headers: this.authHeaders(),
              params,
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  getSummary(targetId: number, targetType: ReactionTargetType = 'POST'): Observable<ReactionSummaryResponse> {
    let params = new HttpParams();
    params = params.set('targetId', targetId);
    params = params.set('targetType', targetType);

    return this.http.get<ReactionSummaryResponse>(`${this.gatewayReactionsApiBaseUrl}/summary`, {
      params,
    }).pipe(
      catchError((primaryError) =>
        this.http.get<ReactionSummaryResponse>(`${this.alternateGatewayReactionsApiBaseUrl}/summary`, {
          params,
        }).pipe(
          catchError((secondaryError) =>
            this.http.get<ReactionSummaryResponse>(`${this.directReactionsApiBaseUrl}/summary`, {
              params,
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  getMyPostReactions(): Observable<UserPostReactionResponse[]> {
    return this.http.get<UserPostReactionResponse[]>(`${this.gatewayReactionsApiBaseUrl}/me/posts`, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((primaryError) =>
        this.http.get<UserPostReactionResponse[]>(`${this.alternateGatewayReactionsApiBaseUrl}/me/posts`, {
          headers: this.authHeaders(),
        }).pipe(
          catchError((secondaryError) =>
            this.http.get<UserPostReactionResponse[]>(`${this.directReactionsApiBaseUrl}/me/posts`, {
              headers: this.authHeaders(),
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  getUsers(
    targetId: number,
    targetType: ReactionTargetType = 'POST',
    reactionType: ReactionType = 'LIKE',
  ): Observable<ReactionUserResponse[]> {
    let params = new HttpParams();
    params = params.set('targetId', targetId);
    params = params.set('targetType', targetType);
    params = params.set('reactionType', reactionType);

    return this.http.get<ReactionUserResponse[]>(`${this.gatewayReactionsApiBaseUrl}/users`, {
      params,
    }).pipe(
      catchError((primaryError) =>
        this.http.get<ReactionUserResponse[]>(`${this.alternateGatewayReactionsApiBaseUrl}/users`, {
          params,
        }).pipe(
          catchError((secondaryError) =>
            this.http.get<ReactionUserResponse[]>(`${this.directReactionsApiBaseUrl}/users`, {
              params,
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}
