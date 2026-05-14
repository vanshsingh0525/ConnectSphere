import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { retry } from 'rxjs';

import { AuthResponse, AuthService, AuthUser } from '../services/auth.service';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPageComponent implements OnInit {
  title = 'ConnectSphere';
  isLoginMode = true;
  loading = false;
  errorMessage = '';
  successMessage = '';
  successToastMessage = '';
  showSuccessToast = false;
  readonly passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  readonly namePattern = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
  fieldErrors: Record<string, string> = {};
  showRegisterPassword = false;

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2), Validators.pattern(this.namePattern)]],
    lastName: ['', [Validators.required, Validators.minLength(2), Validators.pattern(this.namePattern)]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_]+$/)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(this.passwordPattern)]],
  });

  constructor(
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      void this.router.navigate(['/dashboard']);
      return;
    }

    this.handleOAuthCallback();
    this.route.queryParamMap.subscribe((params) => {
      const mode = params.get('mode');
      this.isLoginMode = mode !== 'signup';
    });

    this.registerForm.controls.firstName.valueChanges.subscribe(() => this.clearFieldError('firstName'));
    this.registerForm.controls.lastName.valueChanges.subscribe(() => this.clearFieldError('lastName'));
    this.registerForm.controls.username.valueChanges.subscribe(() => this.clearFieldError('username'));
    this.registerForm.controls.email.valueChanges.subscribe(() => this.clearFieldError('email'));
    this.registerForm.controls.password.valueChanges.subscribe(() => this.clearFieldError('password'));
  }

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.resetMessages();
  }

  submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.resetMessages();
    const value = this.loginForm.getRawValue();

    this.authService
      .login({
        usernameOrEmail: value.email,
        password: value.password,
      })
      .subscribe({
        next: (response: AuthResponse) => {
          this.authService.persistSession(response);
          this.successMessage = `Welcome back, ${response.user.username}!`;
          this.loading = false;
          void this.router.navigate(['/dashboard']);
        },
        error: (error: { error?: { message?: string; errors?: Record<string, string> } }) => {
          this.errorMessage = error?.error?.errors?.['general'] ?? error?.error?.message ?? 'Login failed. Please check your credentials.';
          this.loading = false;
        },
      });
  }

  submitRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.resetMessages();
    const value = this.registerForm.getRawValue();

    this.authService
      .register({
        firstName: value.firstName,
        lastName: value.lastName,
        username: value.username,
        email: value.email,
        password: value.password,
        phoneNumber: '',
      })
      .subscribe({
        next: (response: AuthResponse) => {
          void response;
          this.handleRegistrationSuccess();
        },
        error: (error: HttpErrorResponse) => {
          const responseError = (error.error ?? {}) as { message?: string; errors?: Record<string, string> };
          const backendErrors = responseError.errors ?? {};
          this.applyBackendFieldErrors(backendErrors);
          const hasFieldErrors = ['firstName', 'lastName', 'username', 'email', 'password'].some((key) => !!backendErrors[key]);
          if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) {
            this.errorMessage = 'Auth service is temporarily unavailable. Please ensure api-gateway and auth-service are running.';
            this.loading = false;
            return;
          }
          if (hasFieldErrors) {
            this.errorMessage = '';
            this.loading = false;
            return;
          }
          this.errorMessage =
            responseError.errors?.['general'] ??
            responseError.message ??
            'Registration failed. Please review highlighted fields and try again.';
          this.loading = false;
        },
      });
  }

  loginWithGoogle(): void {
    window.location.href = this.authService.googleLoginUrl();
  }

  private handleOAuthCallback(): void {
    if (window.location.pathname !== '/oauth2/callback') {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const accessToken = query.get('accessToken');
    const refreshToken = query.get('refreshToken');
    const username = query.get('username');
    const oauthError = query.get('error');
    const oauthMessage = query.get('message');

    if (oauthError) {
      this.errorMessage = oauthMessage ?? 'Google login failed. Please try again.';
      window.history.replaceState({}, document.title, '/login');
      return;
    }

    if (accessToken && refreshToken) {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      if (username) {
        localStorage.setItem('oauthUsername', username);
      }
      this.authService.getProfile().pipe(retry(1)).subscribe({
        next: (user) => {
          this.authService.persistOAuthSession(accessToken, refreshToken, user);
          this.successMessage = username
            ? `Google login successful. Welcome, ${username}!`
            : `Google login successful. Welcome, ${user.username}!`;
          window.history.replaceState({}, document.title, '/dashboard');
          void this.router.navigate(['/dashboard']);
        },
        error: (error: { status?: number; error?: { message?: string } }) => {
          const fallbackUser = this.buildOAuthFallbackUser(accessToken, username);
          if (fallbackUser) {
            this.authService.persistOAuthSession(accessToken, refreshToken, fallbackUser);
            this.successMessage = `Google login successful. Welcome, ${fallbackUser.username}!`;
            window.history.replaceState({}, document.title, '/dashboard');
            void this.router.navigate(['/dashboard']);
            return;
          }

          this.authService.clearSession();
          const backendMessage = error?.error?.message;
          if (backendMessage) {
            this.errorMessage = backendMessage;
          } else if (error?.status === 401) {
            this.errorMessage = 'Google login succeeded but session validation failed. Please sign in again.';
          } else {
            this.errorMessage = 'Google login succeeded but profile loading failed. Please sign in again.';
          }
          window.history.replaceState({}, document.title, '/login');
        },
      });
      return;
    }

    this.errorMessage = 'Google login failed. Please try again.';
    window.history.replaceState({}, document.title, '/login');
  }

  private buildOAuthFallbackUser(accessToken: string, usernameFromQuery: string | null): AuthUser | null {
    try {
      const payload = this.decodeJwtPayload(accessToken);
      const userIdRaw = payload?.['userId'];
      const usernameRaw = payload?.['sub'];
      const roleRaw = payload?.['role'];

      const userId = typeof userIdRaw === 'number' ? userIdRaw : Number(userIdRaw);
      if (!Number.isFinite(userId) || userId <= 0) {
        return null;
      }

      const username =
        (typeof usernameRaw === 'string' && usernameRaw.trim()) ||
        (usernameFromQuery?.trim() ?? '') ||
        'oauth-user';

      const role = (typeof roleRaw === 'string' && roleRaw.trim()) ? roleRaw : 'USER';

      return {
        id: userId,
        firstName: 'OAuth',
        lastName: 'User',
        username,
        email: '',
        role,
        provider: 'GOOGLE',
        active: true,
      };
    } catch {
      return null;
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error('Invalid token');
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(paddedBase64);
    return JSON.parse(json) as Record<string, unknown>;
  }

  getRegisterError(fieldName: 'firstName' | 'lastName' | 'username' | 'email' | 'password'): string {
    if (this.fieldErrors[fieldName]) {
      return this.fieldErrors[fieldName];
    }

    const control = this.registerForm.controls[fieldName];
    if (!control.touched && !control.dirty) {
      return '';
    }

    if (control.hasError('required')) {
      if (fieldName === 'firstName') {
        return 'First name is required';
      }
      if (fieldName === 'lastName') {
        return 'Last name is required';
      }
      if (fieldName === 'username') {
        return 'Username is required';
      }
      if (fieldName === 'email') {
        return 'Email is required';
      }
      return 'Password is required';
    }
    if ((fieldName === 'firstName' || fieldName === 'lastName') && control.hasError('minlength')) {
      return `${fieldName === 'firstName' ? 'First' : 'Last'} name must be at least 2 characters`;
    }
    if ((fieldName === 'firstName' || fieldName === 'lastName') && control.hasError('pattern')) {
      return `${fieldName === 'firstName' ? 'First' : 'Last'} name can contain alphabets only`;
    }
    if (fieldName === 'username' && control.hasError('minlength')) {
      return 'Username must be at least 3 characters';
    }
    if (fieldName === 'username' && control.hasError('maxlength')) {
      return 'Username must be at most 20 characters';
    }
    if (fieldName === 'username' && control.hasError('pattern')) {
      return 'Username can contain only letters, numbers and underscore';
    }
    if (fieldName === 'email' && control.hasError('email')) {
      return 'Enter a valid email address';
    }
    if (fieldName === 'password' && control.hasError('pattern')) {
      return 'Password must contain uppercase, lowercase, number and special character';
    }

    return '';
  }

  private applyBackendFieldErrors(errors: Record<string, string>): void {
    this.fieldErrors = {};
    const validFieldNames = ['firstName', 'lastName', 'username', 'email', 'password'];
    for (const key of Object.keys(errors)) {
      if (validFieldNames.includes(key)) {
        this.fieldErrors[key] = errors[key];
        this.registerForm.controls[key as 'firstName' | 'lastName' | 'username' | 'email' | 'password'].setErrors({
          ...(this.registerForm.controls[key as 'firstName' | 'lastName' | 'username' | 'email' | 'password'].errors ?? {}),
          server: true,
        });
      }
    }
  }

  private clearFieldError(fieldName: 'firstName' | 'lastName' | 'username' | 'email' | 'password'): void {
    if (!this.fieldErrors[fieldName]) {
      return;
    }
    const next = { ...this.fieldErrors };
    delete next[fieldName];
    this.fieldErrors = next;

    const control = this.registerForm.controls[fieldName];
    if (control.errors?.['server']) {
      const { server, ...rest } = control.errors;
      control.setErrors(Object.keys(rest).length ? rest : null);
    }
  }

  private resetMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.fieldErrors = {};
  }

  private handleRegistrationSuccess(): void {
    this.loading = false;
    this.resetMessages();
    this.registerForm.reset({
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
    });
    this.registerForm.markAsPristine();
    this.registerForm.markAsUntouched();
    Object.values(this.registerForm.controls).forEach((control) => control.setErrors(null));

    this.successToastMessage = 'Registration successful! Redirecting to login...';
    this.showSuccessToast = true;

    window.setTimeout(() => {
      this.showSuccessToast = false;
      this.successToastMessage = '';
    }, 2000);

    window.setTimeout(() => {
      this.isLoginMode = true;
      void this.router.navigate(['/login']);
    }, 1800);
  }

  toggleRegisterPasswordVisibility(): void {
    this.showRegisterPassword = !this.showRegisterPassword;
  }

  get passwordStrengthLabel(): string {
    const value = this.registerForm.controls.password.value ?? '';
    if (!value) {
      return 'None';
    }
    const score = this.calculatePasswordScore(value);
    if (score <= 2) {
      return 'Weak';
    }
    if (score <= 4) {
      return 'Medium';
    }
    return 'Strong';
  }

  get passwordStrengthClass(): string {
    const label = this.passwordStrengthLabel.toLowerCase();
    return `strength-${label}`;
  }

  private calculatePasswordScore(password: string): number {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[@$!%*?&]/.test(password)) score++;
    return score;
  }
}
