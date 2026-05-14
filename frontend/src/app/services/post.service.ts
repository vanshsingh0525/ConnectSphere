import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { HttpParams } from '@angular/common/http';

import { environment } from '../../environments/environment';

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
}

export type PostVisibility = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';

export interface PostItem {
  id: number;
  authorId: number;
  text: string;
  mediaUrl: string | null;
  location?: string | null;
  hashtags?: string[];
  taggedUsers?: string[];
  visibility: PostVisibility;
  engagementScore: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  saved: boolean;
  archived: boolean;
  deleted: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  edited?: boolean;
}

export interface CreatePostRequest {
  text: string;
  mediaUrl?: string;
  location?: string;
  hashtags?: string[];
  taggedUsers?: string[];
}

interface UpdatePostRequest {
  text: string;
  mediaUrl?: string;
  hashtags?: string[];
  taggedUsers?: string[];
}

export interface PostMediaUploadResponse {
  fileName: string;
  fileUrl: string;
  size: number;
  contentType: string;
}

interface UpdateVisibilityRequest {
  visibility: PostVisibility;
}

export interface UpdatePostCountersRequest {
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  likesDelta?: number;
  commentsDelta?: number;
  sharesDelta?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PostService {
  private readonly postsApiBaseUrl = `${environment.apiGatewayUrl}/api/v1/posts`;
  private readonly publicPostsApiBaseUrl = `${environment.apiGatewayUrl}/api/posts`;
  private readonly directPostsApiBaseUrl = 'http://localhost:8082/api/v1/posts';
  private readonly publicFeedUrl = `${environment.apiGatewayUrl}/api/posts/feed`;
  private readonly postMediaUploadUrl = `${environment.apiGatewayUrl}/api/v1/media/upload`;

  constructor(private readonly http: HttpClient) {}

  createPost(payload: CreatePostRequest): Observable<PostItem> {
    return this.http.post<PostItem>(this.postsApiBaseUrl, payload, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  uploadPostMedia(file: File): Observable<PostMediaUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<PostMediaUploadResponse>(this.postMediaUploadUrl, formData, {
      headers: this.authHeaders(),
    });
  }

  getFeed(page = 0, size = 20, sort: 'latest' | 'trending' = 'latest'): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/feed`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getLandingFeed(): Observable<PostItem[]> {
    return this.http.get<PostItem[]>(this.publicFeedUrl).pipe(
      catchError(() =>
        this.getPublicPosts(0, 30, 'latest').pipe(
          map((page) => page.content),
        ),
      ),
    );
  }

  getPublicPosts(page = 0, size = 20, sort: 'latest' | 'trending' = 'latest'): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/public`, {
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  searchPosts(
    query: string,
    page = 0,
    size = 20,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    let params = this.pageableParams(page, size, sort);
    params = params.set('q', query);

    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/search`, {
      headers: this.authHeaders(),
      params,
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getPostsByUser(
    userId: number,
    page = 0,
    size = 18,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/user/${userId}`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getPublicPostsByUser(userId: number): Observable<PostItem[]> {
    return this.http.get<PostItem[]>(`${environment.apiGatewayUrl}/api/posts/user/${userId}`).pipe(
      catchError(() =>
        this.http
          .get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/user/${userId}`, {
            headers: this.authHeaders(),
            params: this.pageableParams(0, 60, 'latest'),
          })
          .pipe(
            map((page) => this.normalizePageResponse(page).content ?? []),
            catchError(() => of([] as PostItem[])),
          ),
      ),
    );
  }

  getPostById(postId: number): Observable<PostItem> {
    return this.http.get<PostItem>(`${this.postsApiBaseUrl}/${postId}`, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
      catchError((primaryError) =>
        this.http.get<PostItem>(`${this.publicPostsApiBaseUrl}/${postId}`, {
          headers: this.authHeaders(),
        }).pipe(
          map((post) => this.normalizePostItem(post)),
          catchError((secondaryError) =>
            this.http.get<PostItem>(`${this.directPostsApiBaseUrl}/${postId}`, {
              headers: this.authHeaders(),
            }).pipe(
              map((post) => this.normalizePostItem(post)),
              catchError(() => throwError(() => secondaryError ?? primaryError)),
            ),
          ),
        ),
      ),
    );
  }

  getPublicPostsByUsername(username: string): Observable<PostItem[]> {
    const encodedUsername = encodeURIComponent(username);

    return this.http.get<PostItem[]>(`${environment.apiGatewayUrl}/api/posts/user/${encodedUsername}`).pipe(
      map((posts) => posts.map((post) => this.normalizePostItem(post))),
      catchError(() => of([] as PostItem[])),
    );
  }

  getPostsByUsernamePage(
    username: string,
    page = 0,
    size = 18,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    const encodedUsername = encodeURIComponent(username);
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/user/${encodedUsername}`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getTaggedPostsByUsernamePage(
    username: string,
    page = 0,
    size = 18,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    const encodedUsername = encodeURIComponent(username);
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/tagged/${encodedUsername}`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getSavedPosts(
    page = 0,
    size = 18,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/saved`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
    );
  }

  getArchivedPosts(
    page = 0,
    size = 18,
    sort: 'latest' | 'trending' = 'latest',
  ): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/me/archived`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, sort),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
      catchError((primaryError) =>
        this.http.get<PageResponse<PostItem>>(`${this.directPostsApiBaseUrl}/me/archived`, {
          headers: this.authHeaders(),
          params: this.pageableParams(page, size, sort),
        }).pipe(
          map((page) => this.normalizePageResponse(page)),
          catchError(() => throwError(() => primaryError)),
        ),
      ),
    );
  }

  getRecentlyDeletedPosts(page = 0, size = 18): Observable<PageResponse<PostItem>> {
    return this.http.get<PageResponse<PostItem>>(`${this.postsApiBaseUrl}/me/recently-deleted`, {
      headers: this.authHeaders(),
      params: this.pageableParams(page, size, 'latest'),
    }).pipe(
      map((page) => this.normalizePageResponse(page)),
      catchError((primaryError) =>
        this.http.get<PageResponse<PostItem>>(`${this.directPostsApiBaseUrl}/me/recently-deleted`, {
          headers: this.authHeaders(),
          params: this.pageableParams(page, size, 'latest'),
        }).pipe(
          map((page) => this.normalizePageResponse(page)),
          catchError(() => throwError(() => primaryError)),
        ),
      ),
    );
  }

  getPostCountByUsername(username: string): Observable<number> {
    const encodedUsername = encodeURIComponent(username);

    return this.http.get<{ count: number }>(`${this.postsApiBaseUrl}/user/${encodedUsername}/count`).pipe(
      map((response) => Math.max(0, Number(response?.count ?? 0))),
      catchError(() => of(0)),
    );
  }

  updateVisibility(postId: number, visibility: PostVisibility): Observable<PostItem> {
    const payload: UpdateVisibilityRequest = { visibility };
    return this.http.put<PostItem>(`${this.postsApiBaseUrl}/${postId}/visibility`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  updatePostCounters(postId: number, payload: UpdatePostCountersRequest): Observable<PostItem> {
    return this.http.patch<PostItem>(`${this.postsApiBaseUrl}/${postId}/counters`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  refreshPostCounters(postId: number): Observable<PostItem> {
    return this.http.put<PostItem>(`${this.postsApiBaseUrl}/${postId}/counters/refresh`, {}, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  updatePost(id: number, payload: UpdatePostRequest): Observable<PostItem> {
    return this.http.put<PostItem>(`${this.postsApiBaseUrl}/${id}`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  deletePost(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.postsApiBaseUrl}/${id}`, {
      headers: this.authHeaders(),
    });
  }

  archivePost(id: number): Observable<PostItem> {
    return this.http.post<PostItem>(`${this.postsApiBaseUrl}/${id}/archive`, {}, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  unarchivePost(id: number): Observable<PostItem> {
    return this.http.delete<PostItem>(`${this.postsApiBaseUrl}/${id}/archive`, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  restorePost(id: number): Observable<PostItem> {
    return this.http.put<PostItem>(`${this.postsApiBaseUrl}/${id}/restore`, {}, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  permanentlyDeletePost(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.postsApiBaseUrl}/${id}/permanent`, {
      headers: this.authHeaders(),
    });
  }

  savePost(postId: number): Observable<PostItem> {
    return this.http.post<PostItem>(`${this.postsApiBaseUrl}/${postId}/save`, {}, {
      headers: this.authHeaders(),
    }).pipe(
      map((post) => this.normalizePostItem(post)),
    );
  }

  unsavePost(postId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.postsApiBaseUrl}/${postId}/save`, {
      headers: this.authHeaders(),
    });
  }

  private pageableParams(page: number, size: number, sort: 'latest' | 'trending'): HttpParams {
    let params = new HttpParams();
    params = params.set('page', page);
    params = params.set('size', size);
    params = params.set('sort', sort);
    return params;
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }

  private normalizePageResponse(page: PageResponse<PostItem>): PageResponse<PostItem> {
    return {
      ...page,
      content: (page.content ?? []).map((post) => this.normalizePostItem(post)),
    };
  }

  private normalizePostItem(post: PostItem): PostItem {
    const taggedUsers = this.normalizeTaggedUsers(post.taggedUsers, post.text);
    const hashtags = this.normalizeHashtags(post.hashtags, post.text);

    return {
      ...post,
      hashtags,
      taggedUsers,
    };
  }

  private normalizeTaggedUsers(taggedUsers: string[] | undefined, text: string | undefined): string[] {
    const normalized = new Set<string>();

    for (const username of taggedUsers ?? []) {
      const sanitized = username?.trim().replace(/^@/, '').toLowerCase();
      if (sanitized) {
        normalized.add(sanitized);
      }
    }

    const matches = text?.match(/@([A-Za-z0-9_.]+)/g) ?? [];
    for (const mention of matches) {
      const sanitized = mention.replace(/^@/, '').trim().toLowerCase();
      if (sanitized) {
        normalized.add(sanitized);
      }
    }

    return [...normalized];
  }

  private normalizeHashtags(hashtags: string[] | undefined, text: string | undefined): string[] {
    const normalized = new Set<string>();

    for (const hashtag of hashtags ?? []) {
      const sanitized = hashtag?.trim().replace(/^#/, '').toLowerCase();
      if (sanitized) {
        normalized.add(sanitized);
      }
    }

    const matches = text?.match(/#(\w+)/g) ?? [];
    for (const hashtag of matches) {
      const sanitized = hashtag.replace(/^#/, '').trim().toLowerCase();
      if (sanitized) {
        normalized.add(sanitized);
      }
    }

    return [...normalized];
  }
}
