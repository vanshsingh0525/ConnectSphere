import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CommentItem {
  id: number;
  postId: number;
  parentCommentId: number | null;
  authorId: number;
  content: string;
  deleted: boolean;
  edited: boolean;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
  replies: CommentItem[];
}

export interface UserCommentActivityItem {
  id: number;
  postId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateCommentRequest {
  postId: number;
  parentCommentId?: number;
  content: string;
}

interface UpdateCommentRequest {
  content: string;
}

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  private readonly commentsApiBaseUrl = `${environment.apiGatewayUrl}/api/comments`;
  private readonly alternateCommentsApiBaseUrl = `${environment.apiGatewayUrl}/api/v1/comments`;
  private readonly directCommentsApiBaseUrl = 'http://localhost:8087/api/v1/comments';

  constructor(private readonly http: HttpClient) {}

  getCommentsByPost(postId: number): Observable<CommentItem[]> {
    return this.http.get<CommentItem[]>(`${this.commentsApiBaseUrl}/post/${postId}`).pipe(
      catchError((primaryError) =>
        this.http.get<CommentItem[]>(`${this.alternateCommentsApiBaseUrl}/post/${postId}`).pipe(
          catchError((secondaryError) =>
            this.http.get<CommentItem[]>(`${this.directCommentsApiBaseUrl}/post/${postId}`).pipe(
              catchError(() => throwError(() => secondaryError ?? primaryError)),
            ),
          ),
        ),
      ),
    );
  }

  getCommentsCount(postId: number): Observable<number> {
    return this.http.get<number>(`${this.commentsApiBaseUrl}/post/${postId}/count`).pipe(
      catchError((primaryError) =>
        this.http.get<number>(`${this.alternateCommentsApiBaseUrl}/post/${postId}/count`).pipe(
          catchError((secondaryError) =>
            this.http.get<number>(`${this.directCommentsApiBaseUrl}/post/${postId}/count`).pipe(
              catchError(() => throwError(() => secondaryError ?? primaryError)),
            ),
          ),
        ),
      ),
    );
  }

  getMyComments(): Observable<UserCommentActivityItem[]> {
    return this.http.get<UserCommentActivityItem[]>(`${this.commentsApiBaseUrl}/me`, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((primaryError) =>
        this.http.get<UserCommentActivityItem[]>(`${this.alternateCommentsApiBaseUrl}/me`, {
          headers: this.authHeaders(),
        }).pipe(
          catchError((secondaryError) =>
            this.http.get<UserCommentActivityItem[]>(`${this.directCommentsApiBaseUrl}/me`, {
              headers: this.authHeaders(),
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  addComment(postId: number, content: string, parentCommentId?: number): Observable<CommentItem> {
    const payload: CreateCommentRequest = {
      postId,
      content,
    };
    if (parentCommentId != null) {
      payload.parentCommentId = parentCommentId;
    }

    return this.http.post<CommentItem>(this.commentsApiBaseUrl, payload, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((primaryError) =>
        this.http.post<CommentItem>(this.alternateCommentsApiBaseUrl, payload, {
          headers: this.authHeaders(),
        }).pipe(
          catchError((secondaryError) =>
            this.http.post<CommentItem>(this.directCommentsApiBaseUrl, payload, {
              headers: this.authHeaders(),
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  deleteComment(commentId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.commentsApiBaseUrl}/${commentId}`, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((primaryError) =>
        this.http.delete<{ message: string }>(`${this.alternateCommentsApiBaseUrl}/${commentId}`, {
          headers: this.authHeaders(),
        }).pipe(
          catchError((secondaryError) =>
            this.http.delete<{ message: string }>(`${this.directCommentsApiBaseUrl}/${commentId}`, {
              headers: this.authHeaders(),
            }).pipe(catchError(() => throwError(() => secondaryError ?? primaryError))),
          ),
        ),
      ),
    );
  }

  updateComment(commentId: number, content: string): Observable<CommentItem> {
    const payload: UpdateCommentRequest = { content };
    return this.http.put<CommentItem>(`${this.commentsApiBaseUrl}/${commentId}`, payload, {
      headers: this.authHeaders(),
    }).pipe(
      catchError((primaryError) =>
        this.http.put<CommentItem>(`${this.alternateCommentsApiBaseUrl}/${commentId}`, payload, {
          headers: this.authHeaders(),
        }).pipe(
          catchError((secondaryError) =>
            this.http.put<CommentItem>(`${this.directCommentsApiBaseUrl}/${commentId}`, payload, {
              headers: this.authHeaders(),
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
