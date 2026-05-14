import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, forkJoin, map, of, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  provider: string;
  active: boolean;
  bio?: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  website?: string;
  verified?: boolean;
}

export interface UpdateUserProfilePayload {
  username: string;
  name: string;
  bio: string;
  website?: string;
  profileImage?: File | null;
}

export interface MyProfileResponse {
  username: string;
  name: string;
  bio: string;
  profileImageUrl: string;
  isPublic: boolean;
  postCount: number;
  followers: number;
  following: number;
  verified?: boolean;
  commentsEnabled?: boolean;
}

export interface PublicUserProfile {
  id: number;
  username: string;
  name: string;
  bio: string;
  profileImageUrl: string;
  isPublic: boolean;
  verified?: boolean;
}

export interface UserProfileResponse {
  userId: number;
  username: string;
  name: string;
  bio: string;
  profileImageUrl: string;
  isPublic: boolean;
  verified?: boolean;
  postCount: number;
  followers: number;
  following: number;
}

export interface CommentSettingsResponse {
  commentsEnabled: boolean;
}

export interface AccountPrivacySettingsResponse {
  isPublic: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: AuthUser;
}

interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  phoneNumber: string;
}

interface LoginRequest {
  usernameOrEmail: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly gatewayBaseUrl = environment.apiGatewayUrl;
  private readonly authApiBaseUrl = `${this.gatewayBaseUrl}/api/v1/auth`;
  private readonly directAuthBaseUrl = 'http://localhost:8081';

  private readonly authStateSubject = new BehaviorSubject<boolean>(this.hasAccessToken());
  readonly isAuthenticated$ = this.authStateSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authApiBaseUrl}/register`, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.post<AuthResponse>(`${this.directAuthBaseUrl}/api/v1/auth/register`, payload).pipe(
          catchError((directError: HttpErrorResponse) => {
            if (directError.status !== 409) {
              return throwError(() => directError);
            }

            // Registration may have succeeded on the gateway path before retry.
            // Verify by attempting login with submitted credentials.
            return this.login({
              usernameOrEmail: payload.email,
              password: payload.password,
            }).pipe(
              catchError(() => throwError(() => directError)),
            );
          }),
        );
      }),
    );
  }

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.authApiBaseUrl}/login`, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetryDirect(error)) {
          return throwError(() => error);
        }
        return this.http.post<AuthResponse>(`${this.directAuthBaseUrl}/api/v1/auth/login`, payload);
      }),
    );
  }

  getProfile(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.authApiBaseUrl}/profile`, {
        headers: this.authHeaders(),
      })
      .pipe(
        map((user) => this.normalizeAuthUser(user)),
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.get<AuthUser>(`${this.directAuthBaseUrl}/api/v1/auth/profile`, {
            headers: this.authHeaders(),
          }).pipe(map((user) => this.normalizeAuthUser(user)));
        }),
      );
  }

  getMyProfile(): Observable<MyProfileResponse> {
    return this.http
      .get<MyProfileResponse>(`${this.gatewayBaseUrl}/api/users/me`, {
        headers: this.authHeaders(),
      })
      .pipe(
        map((profile) => this.normalizeMyProfile(profile)),
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.get<MyProfileResponse>(`${this.directAuthBaseUrl}/api/users/me`, {
            headers: this.authHeaders(),
          }).pipe(map((profile) => this.normalizeMyProfile(profile)));
        }),
      );
  }

  getPublicProfiles(): Observable<PublicUserProfile[]> {
    return this.http
      .get<PublicUserProfile[]>(`${this.gatewayBaseUrl}/api/users/public`)
      .pipe(
        map((users) => users.map((user) => this.normalizePublicProfile(user))),
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error) && error.status !== 401 && error.status !== 404) {
            return throwError(() => error);
          }

          return this.http
            .get<PublicUserProfile[]>(`${this.directAuthBaseUrl}/api/users/public`)
            .pipe(map((users) => users.map((user) => this.normalizePublicProfile(user))));
        }),
      );
  }

  getUserByUsername(username: string): Observable<UserProfileResponse> {
    const encodedUsername = encodeURIComponent(username);
    const directUrl = `${this.directAuthBaseUrl}/api/users/${encodedUsername}`;

    return this.http
      .get<UserProfileResponse>(`${this.gatewayBaseUrl}/api/users/${encodedUsername}`, {
        headers: this.authHeaders(),
      })
      .pipe(
        map((profile) => this.normalizeUserProfile(profile)),
        catchError((error: HttpErrorResponse) => {
          if (this.shouldRetryDirect(error) || error.status === 401 || error.status === 403 || error.status === 404) {
            return this.http.get<UserProfileResponse>(directUrl, {
              headers: this.authHeaders(),
            }).pipe(
              map((profile) => this.normalizeUserProfile(profile)),
              catchError(() =>
                this.getPublicProfiles().pipe(
                  map((users) => {
                    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
                    if (!user) {
                      throw error;
                    }

                    return {
                      userId: user.id,
                      username: user.username,
                      name: user.name,
                      bio: user.bio,
                      profileImageUrl: user.profileImageUrl,
                      isPublic: user.isPublic,
                      verified: user.verified ?? false,
                      postCount: 0,
                      followers: 0,
                      following: 0,
                    } satisfies UserProfileResponse;
                  }),
                ),
              ),
            );
          }

          return throwError(() => error);
        }),
      );
  }

  updateUserProfile(payload: UpdateUserProfilePayload): Observable<AuthUser> {
    const formData = new FormData();
    formData.append('username', payload.username);
    formData.append('name', payload.name);
    formData.append('bio', payload.bio);
    formData.append('website', payload.website ?? '');

    if (payload.profileImage) {
      formData.append('profileImage', payload.profileImage);
    }

    return this.http
      .put<AuthUser>(`${this.gatewayBaseUrl}/api/users/profile`, formData, {
        headers: this.authHeaders(),
      })
      .pipe(
        map((user) => this.normalizeAuthUser(user)),
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.put<AuthUser>(`${this.directAuthBaseUrl}/api/users/profile`, formData, {
            headers: this.authHeaders(),
          }).pipe(map((user) => this.normalizeAuthUser(user)));
        }),
      );
  }

  getCommentSettings(): Observable<CommentSettingsResponse> {
    return this.http
      .get<CommentSettingsResponse>(`${this.gatewayBaseUrl}/api/users/comment-settings`, {
        headers: this.authHeaders(),
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.get<CommentSettingsResponse>(`${this.directAuthBaseUrl}/api/users/comment-settings`, {
            headers: this.authHeaders(),
          });
        }),
      );
  }

  updateCommentSettings(commentsEnabled: boolean): Observable<CommentSettingsResponse> {
    return this.http
      .put<CommentSettingsResponse>(`${this.gatewayBaseUrl}/api/users/comment-settings`, { commentsEnabled }, {
        headers: this.authHeaders(),
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.put<CommentSettingsResponse>(`${this.directAuthBaseUrl}/api/users/comment-settings`, { commentsEnabled }, {
            headers: this.authHeaders(),
          });
        }),
      );
  }

  getAccountPrivacySettings(): Observable<AccountPrivacySettingsResponse> {
    return this.http
      .get<AccountPrivacySettingsResponse>(`${this.gatewayBaseUrl}/api/users/account-privacy`, {
        headers: this.authHeaders(),
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.get<AccountPrivacySettingsResponse>(`${this.directAuthBaseUrl}/api/users/account-privacy`, {
            headers: this.authHeaders(),
          });
        }),
      );
  }

  updateAccountPrivacySettings(isPublic: boolean): Observable<AccountPrivacySettingsResponse> {
    return this.http
      .put<AccountPrivacySettingsResponse>(`${this.gatewayBaseUrl}/api/users/account-privacy`, { isPublic }, {
        headers: this.authHeaders(),
      })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (!this.shouldRetryDirect(error)) {
            return throwError(() => error);
          }

          return this.http.put<AccountPrivacySettingsResponse>(`${this.directAuthBaseUrl}/api/users/account-privacy`, { isPublic }, {
            headers: this.authHeaders(),
          });
        }),
      );
  }

  googleLoginUrl(): string {
    return `${this.gatewayBaseUrl}/oauth2/authorization/google`;
  }

  persistSession(response: AuthResponse): void {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
    localStorage.setItem('authUser', JSON.stringify(this.normalizeAuthUser(response.user)));
    this.authStateSubject.next(true);
  }

  persistOAuthSession(accessToken: string, refreshToken: string, user: AuthUser): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('authUser', JSON.stringify(this.normalizeAuthUser(user)));
    this.authStateSubject.next(true);
  }

  persistAuthUser(user: AuthUser): void {
    localStorage.setItem('authUser', JSON.stringify(this.normalizeAuthUser(user)));
    this.authStateSubject.next(true);
  }

  refreshAuthUser(): Observable<AuthUser> {
    return this.getProfile().pipe(
      tap((user) => this.persistAuthUser(user)),
    );
  }

  refreshAuthState(): Observable<AuthUser> {
    return forkJoin({
      authUser: this.getProfile().pipe(catchError(() => of(null))),
      myProfile: this.getMyProfile().pipe(catchError(() => of(null))),
    }).pipe(
      map(({ authUser, myProfile }) => {
        const cached = this.getAuthUser();
        const baseUser = authUser ?? cached;

        if (!baseUser) {
          throw new Error('Unable to refresh authenticated user state');
        }

        const fullName = (myProfile?.name ?? '').trim();
        const firstName = fullName.split(' ')[0]?.trim() || baseUser.firstName;
        const lastName = fullName.split(' ').slice(1).join(' ').trim() || baseUser.lastName;

        const merged = this.normalizeAuthUser({
          ...baseUser,
          username: myProfile?.username?.trim() || baseUser.username,
          firstName,
          lastName,
          bio: myProfile?.bio ?? baseUser.bio,
          profileImageUrl: myProfile?.profileImageUrl ?? baseUser.profileImageUrl,
          verified: (myProfile?.verified ?? false) || !!baseUser.verified || !!cached?.verified,
        });

        this.persistAuthUser(merged);
        return merged;
      }),
    );
  }

  isAuthenticated(): boolean {
    return Boolean(localStorage.getItem('accessToken'));
  }

  hasAdminAccess(): boolean {
    const adminUsername = 'vanshslathia03';
    const user = this.getAuthUser();
    const oauthUsername = localStorage.getItem('oauthUsername') ?? '';
    const tokenPayload = this.decodeJwtPayloadSafe(localStorage.getItem('accessToken'));

    const userCandidates = [
      user?.username,
      oauthUsername,
      this.readClaimAsString(tokenPayload, 'username'),
      this.readClaimAsString(tokenPayload, 'preferred_username'),
      this.readClaimAsString(tokenPayload, 'sub'),
      this.readClaimAsString(tokenPayload, 'email'),
      user?.email,
    ].map((value) => this.normalizeIdentityValue(value));

    const hasAdminUsername = userCandidates.some((value) => value === adminUsername);
    if (hasAdminUsername) {
      return true;
    }

    const roleCandidates = [
      user?.role,
      this.readClaimAsString(tokenPayload, 'role'),
      this.readClaimAsString(tokenPayload, 'authorities'),
      this.readClaimAsString(tokenPayload, 'roles'),
    ].map((value) => (value ?? '').trim().toUpperCase());

    return roleCandidates.some((role) => role === 'ADMIN' || role === 'ROLE_ADMIN' || role.includes('ADMIN'));
  }

  getAuthUser(): AuthUser | null {
    const raw = localStorage.getItem('authUser');
    if (!raw) {
      return null;
    }

    try {
      return this.normalizeAuthUser(JSON.parse(raw) as AuthUser);
    } catch {
      return null;
    }
  }

  clearSession(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('oauthUsername');
    this.authStateSubject.next(false);
  }

  private hasAccessToken(): boolean {
    return Boolean(localStorage.getItem('accessToken'));
  }

  private authHeaders(): HttpHeaders {
    const accessToken = localStorage.getItem('accessToken');
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }

  private shouldRetryDirect(error: HttpErrorResponse): boolean {
    return error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504;
  }

  private normalizeAuthUser(user: AuthUser): AuthUser {
    return {
      ...user,
      profileImageUrl: normalizeProfileImageUrl(user.profileImageUrl),
    };
  }

  private normalizeMyProfile(profile: MyProfileResponse): MyProfileResponse {
    return {
      ...profile,
      profileImageUrl: normalizeProfileImageUrl(profile.profileImageUrl),
    };
  }

  private normalizePublicProfile(profile: PublicUserProfile): PublicUserProfile {
    return {
      ...profile,
      profileImageUrl: normalizeProfileImageUrl(profile.profileImageUrl),
    };
  }

  private normalizeUserProfile(profile: UserProfileResponse): UserProfileResponse {
    return {
      ...profile,
      profileImageUrl: normalizeProfileImageUrl(profile.profileImageUrl),
    };
  }

  private decodeJwtPayloadSafe(token: string | null): Record<string, unknown> | null {
    if (!token) {
      return null;
    }
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        return null;
      }
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const json = atob(paddedBase64);
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private readClaimAsString(payload: Record<string, unknown> | null, claim: string): string {
    if (!payload) {
      return '';
    }
    const value = payload[claim];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.filter((entry) => typeof entry === 'string').join(',');
    }
    return '';
  }

  private normalizeIdentityValue(value?: string): string {
    const normalized = (value ?? '').trim().replace(/^@+/, '').toLowerCase();
    if (!normalized) {
      return '';
    }
    if (normalized.includes('@')) {
      return normalized.split('@')[0];
    }
    return normalized;
  }
}
