import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

export interface SearchUserItem {
  id: number;
  username: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  verified?: boolean;
}

export interface SearchPostItem {
  id: number;
  authorId: number;
  text: string;
  mediaUrl: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string | null;
}

export interface SearchHashtagItem {
  name: string;
  postCount: number;
}

export interface GlobalSearchResponse {
  users: SearchUserItem[];
  posts: SearchPostItem[];
  hashtags: SearchHashtagItem[];
}

interface PageResponse<T> {
  content: T[];
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly searchApiBaseUrl = `${environment.apiGatewayUrl}/api/search`;
  private readonly publicPostsApiBaseUrl = `${environment.apiGatewayUrl}/api/posts`;

  constructor(private readonly http: HttpClient) {}

  globalSearch(query: string): Observable<GlobalSearchResponse> {
    const params = new HttpParams().set('q', query);
    return this.http.get<GlobalSearchResponse>(this.searchApiBaseUrl, { params }).pipe(
      map((response) => ({
        ...response,
        users: response.users.map((user) => ({
          ...user,
          profileImageUrl: normalizeProfileImageUrl(user.profileImageUrl),
        })),
      })),
    );
  }

  searchUsers(query: string, page = 0, size = 10): Observable<SearchUserItem[]> {
    const params = new HttpParams().set('q', query).set('page', page).set('size', size);
    return this.http.get<SearchUserItem[]>(`${this.searchApiBaseUrl}/users`, { params }).pipe(
      map((users) => users.map((user) => ({
        ...user,
        profileImageUrl: normalizeProfileImageUrl(user.profileImageUrl),
      }))),
    );
  }

  searchPosts(query: string, page = 0, size = 10): Observable<SearchPostItem[]> {
    const params = new HttpParams().set('q', query).set('page', page).set('size', size);
    return this.http.get<SearchPostItem[]>(`${this.searchApiBaseUrl}/posts`, { params }).pipe(
      map((posts) => this.normalizePosts(posts)),
    );
  }

  searchHashtags(query: string, page = 0, size = 10): Observable<SearchHashtagItem[]> {
    const params = new HttpParams().set('q', query).set('page', page).set('size', size);
    return this.http.get<SearchHashtagItem[]>(`${this.searchApiBaseUrl}/hashtags`, { params });
  }

  getTrendingHashtags(size = 10): Observable<SearchHashtagItem[]> {
    const params = new HttpParams().set('size', size);
    return this.http.get<SearchHashtagItem[]>(`${this.searchApiBaseUrl}/trending`, { params });
  }

  getPostsByHashtag(tag: string, page = 0, size = 10): Observable<SearchPostItem[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<SearchPostItem[]>(`${this.searchApiBaseUrl}/hashtag/${encodeURIComponent(tag)}`, { params }).pipe(
      map((posts) => this.normalizePosts(posts)),
      catchError(() =>
        this.http.get<PageResponse<SearchPostItem> | SearchPostItem[]>(
          `${this.publicPostsApiBaseUrl}/hashtag/${encodeURIComponent(tag)}`,
          { params },
        ).pipe(
          map((response) => {
            const posts = Array.isArray(response) ? response : (response?.content ?? []);
            return this.normalizePosts(posts);
          }),
          catchError(() => of([] as SearchPostItem[])),
        ),
      ),
    );
  }

  saveRecentSearch(searchedUserId: number): Observable<SearchUserItem> {
    return this.http.post<SearchUserItem>(
      `${this.searchApiBaseUrl}/recent`,
      { searchedUserId },
      { headers: this.authHeaders() },
    ).pipe(
      map((user) => ({
        ...user,
        profileImageUrl: normalizeProfileImageUrl(user.profileImageUrl),
      })),
    );
  }

  getRecentSearches(limit = 10): Observable<SearchUserItem[]> {
    const params = new HttpParams().set('limit', Math.max(1, Math.min(10, limit)));
    return this.http.get<SearchUserItem[]>(`${this.searchApiBaseUrl}/recent`, {
      params,
      headers: this.authHeaders(),
    }).pipe(
      map((users) => users.map((user) => ({
        ...user,
        profileImageUrl: normalizeProfileImageUrl(user.profileImageUrl),
      }))),
      catchError(() => of([] as SearchUserItem[])),
    );
  }

  removeRecentSearch(searchedUserId: number): Observable<void> {
    return this.http.delete<void>(`${this.searchApiBaseUrl}/recent/${searchedUserId}`, {
      headers: this.authHeaders(),
    });
  }

  clearRecentSearches(): Observable<void> {
    return this.http.delete<void>(`${this.searchApiBaseUrl}/recent/clear`, {
      headers: this.authHeaders(),
    });
  }

  private normalizePosts(posts: SearchPostItem[]): SearchPostItem[] {
    return (posts ?? []).map((post) => ({
      ...post,
      mediaUrl: this.normalizeMediaUrl(post.mediaUrl),
    }));
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }

  private normalizeMediaUrl(mediaUrl: string | null): string | null {
    if (!mediaUrl) {
      return null;
    }

    const trimmed = mediaUrl.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${environment.apiGatewayUrl}${normalizedPath}`;
  }
}
