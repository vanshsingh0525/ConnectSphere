import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

export type NotificationType =
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'LIKE'
  | 'COMMENT'
  | 'LIKE_POST'
  | 'COMMENT_POST'
  | 'LIKE_COMMENT'
  | 'STORY_REACTION';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  actorUserId: number;
  actorUsername: string;
  actorName: string;
  actorProfileImageUrl: string;
  message: string;
  targetId: number | null;
  targetType: string | null;
  relatedPostId: number | null;
  storyId: string | null;
  previewText: string;
  createdAt: string;
  read: boolean;
  actionable: boolean;
  followRequestStatus: string | null;
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly notificationsApiUrl = `${environment.apiGatewayUrl}/api/v1/notifications`;
  private readonly directNotificationsApiUrl = 'http://localhost:8089/api/v1/notifications';

  constructor(private readonly http: HttpClient) {}

  getNotifications(limit = 50): Observable<NotificationItem[]> {
    return this.http.get<NotificationItem[]>(`${this.notificationsApiUrl}?limit=${limit}`, { headers: this.authHeaders() }).pipe(
      map((notifications) => notifications.map((notification) => ({
        ...notification,
        actorProfileImageUrl: normalizeProfileImageUrl(notification.actorProfileImageUrl),
      }))),
      catchError((primaryError) =>
        this.http.get<NotificationItem[]>(`${this.directNotificationsApiUrl}?limit=${limit}`, { headers: this.authHeaders() }).pipe(
          map((notifications) => notifications.map((notification) => ({
            ...notification,
            actorProfileImageUrl: normalizeProfileImageUrl(notification.actorProfileImageUrl),
          }))),
          catchError(() => throwError(() => primaryError)),
        ),
      ),
    );
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<NotificationUnreadCountResponse>(`${this.notificationsApiUrl}/unread-count`, { headers: this.authHeaders() }).pipe(
      map((response) => Math.max(0, Number(response?.unreadCount ?? 0))),
      catchError((primaryError) =>
        this.http.get<NotificationUnreadCountResponse>(`${this.directNotificationsApiUrl}/unread-count`, { headers: this.authHeaders() }).pipe(
          map((response) => Math.max(0, Number(response?.unreadCount ?? 0))),
          catchError(() => throwError(() => primaryError)),
        ),
      ),
    );
  }

  markAsRead(notificationId: string): Observable<void> {
    return this.http.post<void>(`${this.notificationsApiUrl}/${notificationId}/read`, {}, { headers: this.authHeaders() }).pipe(
      catchError((primaryError) =>
        this.http.post<void>(`${this.directNotificationsApiUrl}/${notificationId}/read`, {}, { headers: this.authHeaders() }).pipe(
          catchError(() => throwError(() => primaryError)),
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
