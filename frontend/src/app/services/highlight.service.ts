import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { StoryDto } from './story.service';

export interface HighlightDto {
  id: number;
  userId: number;
  name: string;
  coverMediaUrl: string;
  stories: StoryDto[];
}

interface CreateHighlightRequest {
  name: string;
  storyIds: string[];
}

interface UpdateHighlightRequest {
  name: string;
}

interface UpdateHighlightStoriesRequest {
  storyIds: string[];
}

@Injectable({
  providedIn: 'root',
})
export class HighlightService {
  private readonly highlightsApiUrl = `${environment.apiGatewayUrl}/api/stories/highlights`;
  private readonly directHighlightsApiUrl = 'http://localhost:8086/api/stories/highlights';

  constructor(private readonly http: HttpClient) {}

  private shouldRetryDirect(error: HttpErrorResponse): boolean {
    return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
  }

  getUserHighlights(userId: number): Observable<HighlightDto[]> {
    return this.http.get<HighlightDto[]>(`${this.highlightsApiUrl}/user/${userId}`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.get<HighlightDto[]>(`${this.directHighlightsApiUrl}/user/${userId}`);
      }),
    );
  }

  createHighlight(name: string, storyIds: string[]): Observable<HighlightDto> {
    const payload: CreateHighlightRequest = {
      name: name.trim(),
      storyIds,
    };

    return this.http.post<HighlightDto>(this.highlightsApiUrl, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }

        return this.http.post<HighlightDto>(this.directHighlightsApiUrl, payload);
      }),
    );
  }

  updateHighlight(highlightId: number, name: string): Observable<HighlightDto> {
    const payload: UpdateHighlightRequest = { name: name.trim() };
    return this.http.put<HighlightDto>(`${this.highlightsApiUrl}/${highlightId}`, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.put<HighlightDto>(`${this.directHighlightsApiUrl}/${highlightId}`, payload);
      }),
    );
  }

  updateHighlightStories(highlightId: number, storyIds: string[]): Observable<HighlightDto> {
    const payload: UpdateHighlightStoriesRequest = { storyIds };
    return this.http.put<HighlightDto>(`${this.highlightsApiUrl}/${highlightId}/stories`, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.put<HighlightDto>(`${this.directHighlightsApiUrl}/${highlightId}/stories`, payload);
      }),
    );
  }

  updateCustomCover(highlightId: number, file: File): Observable<HighlightDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.put<HighlightDto>(`${this.highlightsApiUrl}/${highlightId}/custom-cover`, formData).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.put<HighlightDto>(`${this.directHighlightsApiUrl}/${highlightId}/custom-cover`, formData);
      }),
    );
  }

  deleteHighlight(highlightId: number): Observable<void> {
    return this.http.delete<void>(`${this.highlightsApiUrl}/${highlightId}`).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.delete<void>(`${this.directHighlightsApiUrl}/${highlightId}`);
      }),
    );
  }
}
