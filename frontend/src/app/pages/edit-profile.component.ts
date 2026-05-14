import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { ImageFallbackDirective } from '../directives/image-fallback.directive';
import { AuthService, AuthUser } from '../services/auth.service';
import { normalizeProfileImageUrl } from '../utils/avatar.util';

@Component({
  selector: 'app-edit-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidebarComponent, ImageFallbackDirective],
  templateUrl: './edit-profile.component.html',
  styleUrl: './edit-profile.component.css',
})
export class EditProfileComponent implements OnInit, OnDestroy {
  @ViewChild('profileImageInput')
  private readonly profileImageInput?: ElementRef<HTMLInputElement>;

  activeSidebarItem = 'Settings';
  notificationCount = 0;
  loadingProfile = false;
  saving = false;
  errorMessage = '';

  selectedFile: File | null = null;
  selectedPreviewUrl: string | null = null;
  currentAvatarUrl = '';
  private returnToUrl: string | null = null;

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    bio: ['', [Validators.maxLength(250)]],
    website: ['', [Validators.maxLength(200)]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.returnToUrl = this.readReturnUrl();
    this.loadProfile();
  }

  get displayedAvatar(): string {
    if (this.selectedPreviewUrl) {
      return this.selectedPreviewUrl;
    }

    return normalizeProfileImageUrl(this.currentAvatarUrl);
  }

  onSidebarSelection(item: string): void {
    this.activeSidebarItem = item;

    if (item === 'About Us') {
      void this.router.navigate(['/dashboard'], { queryParams: { view: 'about' } });
      return;
    }

    if (item === 'Home') {
      void this.router.navigate(['/dashboard']);
      return;
    }

    if (item === 'Profile') {
      const username = this.authService.getAuthUser()?.username?.trim();
      if (username) {
        void this.router.navigate(['/profile', username]);
      }
      return;
    }

    if (item === 'Search') {
      void this.router.navigate(['/search']);
      return;
    }

    if (item === 'Notifications') {
      void this.router.navigate(['/settings/notifications']);
    }
  }

  openPhotoPicker(): void {
    this.profileImageInput?.nativeElement.click();
  }

  cancel(): void {
    if (this.returnToUrl) {
      void this.router.navigateByUrl(this.returnToUrl);
      return;
    }

    void this.router.navigate(['/settings']);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage = 'Please select a valid image file.';
      input.value = '';
      return;
    }

    if (this.selectedPreviewUrl) {
      URL.revokeObjectURL(this.selectedPreviewUrl);
    }

    this.errorMessage = '';
    this.selectedFile = file;
    this.selectedPreviewUrl = URL.createObjectURL(file);
    input.value = '';
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    this.authService
      .updateUserProfile({
        username: this.form.controls.username.value.trim(),
        name: this.form.controls.name.value.trim(),
        bio: this.form.controls.bio.value.trim(),
        website: this.form.controls.website.value.trim(),
        profileImage: this.selectedFile,
      })
      .pipe(
        finalize(() => {
          this.saving = false;
        }),
      )
      .subscribe({
        next: (updated) => {
          const existing = this.authService.getAuthUser();
          const mergedUser: AuthUser = {
            ...(existing ?? updated),
            ...updated,
          };
          this.authService.persistAuthUser(mergedUser);
          const username = mergedUser.username?.trim();
          if (username) {
            void this.router.navigate(['/profile', username]);
          }
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage = this.extractErrorMessage(error);
        },
      });
  }

  ngOnDestroy(): void {
    if (this.selectedPreviewUrl) {
      URL.revokeObjectURL(this.selectedPreviewUrl);
    }
  }

  private loadProfile(): void {
    this.loadingProfile = true;
    this.errorMessage = '';

    this.authService
      .getProfile()
      .pipe(
        finalize(() => {
          this.loadingProfile = false;
        }),
      )
      .subscribe({
        next: (user) => {
          this.patchFormFromUser(user);
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401 || error.status === 403) {
            this.authService.clearSession();
            void this.router.navigate(['/login']);
            return;
          }

          const cached = this.authService.getAuthUser();
          if (cached) {
            this.patchFormFromUser(cached);
            this.errorMessage = 'Live profile service is temporarily unavailable. Showing cached profile data.';
            return;
          }

          this.errorMessage = this.extractErrorMessage(error) || 'Unable to load profile details.';
        },
      });
  }

  private patchFormFromUser(user: AuthUser): void {
    const name = `${user.firstName} ${user.lastName}`.trim();

    this.form.patchValue({
      username: user.username,
      name,
      bio: user.bio ?? '',
      website: user.website ?? '',
    });

    this.currentAvatarUrl = normalizeProfileImageUrl(user.profileImageUrl);
  }

  private extractErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401 || error.status === 403) {
      this.authService.clearSession();
      void this.router.navigate(['/login']);
      return 'Session expired. Please sign in again.';
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error;
    }

    const backendMessage = error.error?.message as string | undefined;
    if (backendMessage && backendMessage.trim()) {
      return backendMessage;
    }

    if (error.status === 0) {
      return 'Service is unreachable. Ensure auth-service and api-gateway are running.';
    }

    return `Unable to update profile right now (HTTP ${error.status || 'unknown'}).`;
  }

  private readReturnUrl(): string | null {
    const raw = this.route.snapshot.queryParamMap.get('from')?.trim() ?? '';
    if (!raw) {
      return null;
    }

    if (!raw.startsWith('/')) {
      return null;
    }

    return raw;
  }
}
