import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface MediaUploadResponse {
  fileName: string;
  fileUrl: string;
  size: number;
  contentType: string;
}

@Injectable({
  providedIn: 'root',
})
export class MediaService {
  private readonly mediaUploadUrl = `${environment.apiGatewayUrl}/api/v1/media/upload`;

  constructor(private readonly http: HttpClient) {}

  upload(file: File): Observable<MediaUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<MediaUploadResponse>(this.mediaUploadUrl, formData, {
      headers: this.authHeaders(),
    });
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}