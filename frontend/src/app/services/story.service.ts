import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

export interface StoryDto {
  storyId: string;
  userId: number;
  reactionTargetId: number;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  caption: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  archived: boolean;
  deleted: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  viewCount: number;
  viewedByCurrentUser: boolean;
}

export interface StoryFeedUserResponse {
  userId: number;
  username: string;
  profilePic: string;
  hasUnseen: boolean;
  stories: StoryDto[];
}

export interface StoryViewResponse {
  viewerId: number;
  username: string;
  profilePic: string;
  viewedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class StoryService {
  private readonly storiesApiUrl = `${environment.apiGatewayUrl}/api/stories`;
  private readonly directStoriesApiUrl = 'http://localhost:8086/api/stories';

  constructor(private readonly http: HttpClient) {}

  private shouldRetryDirect(error: HttpErrorResponse): boolean {
    return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
  }

  getStoriesFeed(): Observable<StoryFeedUserResponse[]> {
    return this.http.get<StoryFeedUserResponse[]>(`${this.storiesApiUrl}/feed`).pipe(
      map((users) => users.map((user) => ({
        ...user,
        profilePic: normalizeProfileImageUrl(user.profilePic),
      }))),
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<StoryFeedUserResponse[]>(`${this.directStoriesApiUrl}/feed`).pipe(
          map((users) => users.map((user) => ({
            ...user,
            profilePic: normalizeProfileImageUrl(user.profilePic),
          }))),
        );
      }),
    );
  }

  getUserStories(userId: number): Observable<StoryDto[]> {
    return this.http.get<StoryDto[]>(`${this.storiesApiUrl}/user/${userId}`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<StoryDto[]>(`${this.directStoriesApiUrl}/user/${userId}`);
      }),
    );
  }

  createStory(file: File, caption = ''): Observable<StoryDto> {
    const formData = new FormData();
    formData.append('file', file);
    if (caption.trim()) {
      formData.append('caption', caption.trim());
    }

    return this.http.post<StoryDto>(this.storiesApiUrl, formData).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.post<StoryDto>(this.directStoriesApiUrl, formData);
      }),
    );
  }

  markStoryViewed(storyId: string): Observable<void> {
    return this.http.post<void>(`${this.storiesApiUrl}/${storyId}/view`, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.post<void>(`${this.directStoriesApiUrl}/${storyId}/view`, {});
      }),
    );
  }

  getStoryViewers(storyId: string): Observable<StoryViewResponse[]> {
    return this.http.get<StoryViewResponse[]>(`${this.storiesApiUrl}/${storyId}/views`).pipe(
      map((viewers) => viewers.map((viewer) => ({
        ...viewer,
        profilePic: normalizeProfileImageUrl(viewer.profilePic),
      }))),
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<StoryViewResponse[]>(`${this.directStoriesApiUrl}/${storyId}/views`).pipe(
          map((viewers) => viewers.map((viewer) => ({
            ...viewer,
            profilePic: normalizeProfileImageUrl(viewer.profilePic),
          }))),
        );
      }),
    );
  }

  deleteStory(storyId: string): Observable<void> {
    return this.http.delete<void>(`${this.storiesApiUrl}/${storyId}`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.delete<void>(`${this.directStoriesApiUrl}/${storyId}`);
      }),
    );
  }

  getArchivedStories(): Observable<StoryDto[]> {
    return this.http.get<StoryDto[]>(`${this.storiesApiUrl}/me/archived`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<StoryDto[]>(`${this.directStoriesApiUrl}/me/archived`);
      }),
    );
  }

  getRecentlyDeletedStories(): Observable<StoryDto[]> {
    return this.http.get<StoryDto[]>(`${this.storiesApiUrl}/me/recently-deleted`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<StoryDto[]>(`${this.directStoriesApiUrl}/me/recently-deleted`);
      }),
    );
  }

  restoreStory(storyId: string): Observable<StoryDto> {
    return this.http.post<StoryDto>(`${this.storiesApiUrl}/${storyId}/restore`, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.post<StoryDto>(`${this.directStoriesApiUrl}/${storyId}/restore`, {});
      }),
    );
  }

  permanentlyDeleteStory(storyId: string): Observable<void> {
    return this.http.delete<void>(`${this.storiesApiUrl}/${storyId}/permanent`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.delete<void>(`${this.directStoriesApiUrl}/${storyId}/permanent`);
      }),
    );
  }
}
