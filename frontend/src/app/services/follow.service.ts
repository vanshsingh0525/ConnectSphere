import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

export interface FollowCountsResponse {
  followers: number;
  following: number;
}

export interface FollowStatusResponse {
  isFollowing: boolean;
  isPending: boolean;
  canViewContent: boolean;
  targetPublic: boolean;
}

export interface FollowActionResponse {
  success: boolean;
  alreadyFollowing: boolean;
  isFollowing: boolean;
  isPending: boolean;
  message: string;
}

export interface FollowUserItem {
  userId: number;
  username: string;
  name: string;
  profileImageUrl: string;
}

export interface FollowPagedResponse {
  content: FollowUserItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class FollowService {
  private readonly followsApiUrl = `${environment.apiGatewayUrl}/api/follows`;

  constructor(private readonly http: HttpClient) {}

  getFollowCounts(userId: number): Observable<FollowCountsResponse> {
    return this.http.get<FollowCountsResponse>(`${this.followsApiUrl}/${userId}/counts`, {
      headers: this.authHeaders(),
    });
  }

  getFollowStatus(userId: number): Observable<FollowStatusResponse> {
    return this.http.get<FollowStatusResponse>(`${this.followsApiUrl}/${userId}/status`, {
      headers: this.authHeaders(),
    });
  }

  followUser(userId: number): Observable<FollowActionResponse> {
    return this.http.post<FollowActionResponse>(`${this.followsApiUrl}/${userId}`, {}, {
      headers: this.authHeaders(),
    });
  }

  unfollowUser(userId: number): Observable<FollowActionResponse> {
    return this.http.delete<FollowActionResponse>(`${this.followsApiUrl}/${userId}`, {
      headers: this.authHeaders(),
    });
  }

  acceptFollowRequest(userId: number): Observable<FollowActionResponse> {
    return this.http.post<FollowActionResponse>(`${this.followsApiUrl}/requests/${userId}/accept`, {}, {
      headers: this.authHeaders(),
    });
  }

  deleteFollowRequest(userId: number): Observable<FollowActionResponse> {
    return this.http.delete<FollowActionResponse>(`${this.followsApiUrl}/requests/${userId}`, {
      headers: this.authHeaders(),
    });
  }

  // Backward-compatible wrappers for existing callers.
  getCounts(userId: number): Observable<FollowCountsResponse> {
    return this.getFollowCounts(userId);
  }

  getStatus(userId: number): Observable<FollowStatusResponse> {
    return this.getFollowStatus(userId);
  }

  follow(userId: number): Observable<FollowActionResponse> {
    return this.followUser(userId);
  }

  unfollow(userId: number): Observable<FollowActionResponse> {
    return this.unfollowUser(userId);
  }

  getFollowers(userId: number, page = 0, size = 50): Observable<FollowPagedResponse> {
    return this.http.get<FollowPagedResponse>(`${this.followsApiUrl}/${userId}/followers?page=${page}&size=${size}`, {
      headers: this.authHeaders(),
    }).pipe(
      map((response) => ({
        ...response,
        content: response.content.map((item) => ({
          ...item,
          profileImageUrl: normalizeProfileImageUrl(item.profileImageUrl),
        })),
      })),
    );
  }

  getFollowing(userId: number, page = 0, size = 50): Observable<FollowPagedResponse> {
    return this.http.get<FollowPagedResponse>(`${this.followsApiUrl}/${userId}/following?page=${page}&size=${size}`, {
      headers: this.authHeaders(),
    }).pipe(
      map((response) => ({
        ...response,
        content: response.content.map((item) => ({
          ...item,
          profileImageUrl: normalizeProfileImageUrl(item.profileImageUrl),
        })),
      })),
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}
