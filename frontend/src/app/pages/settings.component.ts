import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { timeout } from 'rxjs';

import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { PaymentStatusResponse, VerificationService } from '../services/verification.service';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit, OnDestroy {
  activeSidebarItem = 'Settings';
  notificationCount = 0;
  isPublic = true;
  privacyLoading = false;
  privacySaving = false;
  privacyMessage = '';
  privacyError = '';
  verificationLoading = false;
  verificationMessage = '';
  verificationError = '';
  isVerified = false;
  verificationPlanLabel = 'Verified Monthly';
  verifiedSinceLabel = '';
  readonly verifiedMembershipChips = ['ACTIVE', 'VERIFIED MEMBER', 'CREATOR VERIFIED'];
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private verificationDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private processingGuardTimer: ReturnType<typeof setTimeout> | null = null;
  private verificationResolved = false;

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly verificationService: VerificationService,
  ) {}

  ngOnInit(): void {
    this.privacyLoading = true;
    this.authService.getAccountPrivacySettings().subscribe({
      next: (response) => {
        this.isPublic = response.isPublic;
        this.privacyLoading = false;
      },
      error: () => {
        this.privacyLoading = false;
        this.privacyError = 'Unable to load account privacy right now.';
      },
    });

    this.loadVerificationMembershipState();
  }

  ngOnDestroy(): void {
    this.clearVerificationTimers();
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

    if (item === 'Search') {
      void this.router.navigate(['/search']);
      return;
    }

    if (item === 'Notifications') {
      void this.router.navigate(['/settings/notifications']);
      return;
    }

    if (item === 'Profile') {
      const username = this.authService.getAuthUser()?.username?.trim();
      if (username) {
        void this.router.navigate(['/profile', username]);
      }
      return;
    }
  }

  goToEditProfile(): void {
    void this.router.navigate(['/settings/edit-profile'], {
      queryParams: { from: this.router.url },
    });
  }

  goToNotifications(): void {
    void this.router.navigate(['/settings/notifications']);
  }

  goToComments(): void {
    void this.router.navigate(['/settings/comments']);
  }

  goToYourActivity(): void {
    void this.router.navigate(['/settings/activity']);
  }

  onPrivacyToggle(nextValue: boolean): void {
    if (this.privacySaving || this.isPublic === nextValue) {
      return;
    }

    const previousValue = this.isPublic;
    this.isPublic = nextValue;
    this.privacySaving = true;
    this.privacyError = '';
    this.privacyMessage = '';

    this.authService.updateAccountPrivacySettings(nextValue).subscribe({
      next: (response) => {
        this.isPublic = response.isPublic;
        this.privacySaving = false;
        this.privacyMessage = response.isPublic
          ? 'Your account is now public.'
          : 'Your account is now private. Only approved followers can view posts and stories.';
      },
      error: (error: HttpErrorResponse) => {
        this.isPublic = previousValue;
        this.privacySaving = false;
        this.privacyError = error.status === 0
          ? 'Auth service is unreachable. Check api-gateway and auth-service.'
          : 'Unable to update privacy right now.';
      },
    });
  }

  startVerificationCheckout(): void {
    if (this.verificationLoading || this.isVerified) {
      return;
    }

    const authUser = this.authService.getAuthUser();
    if (!authUser?.id) {
      void this.router.navigate(['/login']);
      return;
    }

    this.verificationLoading = true;
    this.verificationError = '';
    this.verificationMessage = '';
    this.verificationResolved = false;
    this.clearVerificationTimers();
    this.startProcessingGuard();

    this.ensureRazorpayScriptLoaded().then(() => {
      this.verificationService.createOrder({
        amountInPaise: 19900,
        currency: 'INR',
        planName: 'VERIFIED_MONTHLY',
        validityDays: 30,
      }).subscribe({
        next: (order) => {
          const razorpay = new window.Razorpay({
            key: order.key,
            amount: order.amount,
            currency: order.currency,
            name: 'ConnectSphere Verification',
            description: 'Verified Badge Subscription',
            order_id: order.orderId,
            handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
              this.verificationLoading = false;
              this.verificationMessage = 'Payment successful. Activating verification...';
              const existing = this.authService.getAuthUser();
              if (existing) {
                this.authService.persistAuthUser({ ...existing, verified: true });
              }
              this.isVerified = true;
              void this.router.navigate(['/verified-success'], {
                queryParams: {
                  username: authUser.username ?? '',
                  plan: order.planName || 'VERIFIED_MONTHLY',
                },
              });
              this.beginVerificationResolution(authUser.id, response);
            },
            modal: {
              ondismiss: () => {
                if (this.verificationLoading && !this.verificationResolved) {
                  this.verificationLoading = false;
                  this.verificationError = 'Payment was cancelled.';
                  this.clearVerificationTimers();
                }
              },
            },
            theme: {
              color: '#1d4ed8',
            },
          });

          razorpay.on('payment.failed', () => {
            if (this.verificationResolved) {
              return;
            }
            this.verificationLoading = false;
            this.verificationError = 'Payment failed. Please try again.';
            this.clearVerificationTimers();
          });

          razorpay.open();
        },
        error: (error: HttpErrorResponse) => {
          this.clearVerificationTimers();
          this.verificationLoading = false;
          this.verificationError = (error.error?.message as string | undefined)?.trim()
            || (error.status === 401 || error.status === 403
              ? 'Please login again to continue verification.'
              : 'Unable to start payment right now.');
        },
      });
    }).catch(() => {
      this.clearVerificationTimers();
      this.verificationLoading = false;
      this.verificationError = 'Unable to load Razorpay checkout.';
    });
  }

  private async ensureRazorpayScriptLoaded(): Promise<void> {
    if (window.Razorpay) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay script'));
      document.body.appendChild(script);
    });
  }

  private reconcileVerificationStatus(userId: number): void {
    this.verificationService.getStatus(userId).pipe(
      timeout(7000),
    ).subscribe({
      next: (status) => {
        this.applyVerificationStatus(status);
        if (this.verificationResolved) {
          return;
        }
        const confirmed = !!status.verified && status.status === 'SUCCESS';
        if (confirmed) {
          this.handleVerificationSuccess(status);
          return;
        }
        this.verificationLoading = false;
        this.verificationError = 'Payment verification failed. Please try again.';
      },
      error: () => {
        this.verificationLoading = false;
        this.verificationError = 'Payment verification failed. Please try again.';
      },
    });
  }

  private handleVerificationSuccess(result: PaymentStatusResponse): void {
    if (this.verificationResolved) {
      return;
    }
    this.verificationResolved = true;
    this.clearVerificationTimers();
    this.isVerified = true;
    this.applyVerificationStatus(result);
    this.verificationLoading = false;
    this.verificationMessage = result.message?.trim() || 'Verification activated successfully.';

    this.authService.refreshAuthUser().subscribe({
      next: (user) => {
        void this.router.navigate(['/verified-success'], {
          queryParams: {
            username: user.username,
            plan: result.planName || 'VERIFIED_MONTHLY',
          },
        });
      },
      error: () => {
        const existing = this.authService.getAuthUser();
        if (existing) {
          this.authService.persistAuthUser({ ...existing, verified: true });
        }
        void this.router.navigate(['/verified-success'], {
          queryParams: {
            username: existing?.username ?? '',
            plan: result.planName || 'VERIFIED_MONTHLY',
          },
        });
      },
    });
  }

  private beginVerificationResolution(
    userId: number,
    response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string },
  ): void {
    this.startVerificationStatusPolling(userId);
    this.verificationService.verify({
      razorpayOrderId: response.razorpay_order_id,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature,
    }).pipe(
      timeout(9000),
    ).subscribe({
      next: (result) => {
        const verified = !!result.verified && (result.success ?? result.status === 'SUCCESS');
        if (verified) {
          this.handleVerificationSuccess(result);
        }
      },
      error: () => {
        // Continue polling status. This avoids false failure on delayed verify response.
      },
    });
  }

  private startVerificationStatusPolling(userId: number): void {
    let attempts = 0;
    const maxAttempts = 12; // ~24 seconds
    this.statusPollTimer = setInterval(() => {
      if (this.verificationResolved) {
        this.clearVerificationTimers();
        return;
      }
      attempts += 1;
      this.verificationService.getStatus(userId).pipe(timeout(3500)).subscribe({
        next: (status) => {
          if (!!status.verified && status.status === 'SUCCESS') {
            this.handleVerificationSuccess(status);
            return;
          }
          if (attempts >= maxAttempts) {
            this.finishVerificationFailure();
          }
        },
        error: () => {
          if (attempts >= maxAttempts) {
            this.finishVerificationFailure();
          }
        },
      });
    }, 2000);

    this.verificationDeadlineTimer = setTimeout(() => {
      if (!this.verificationResolved) {
        this.finishVerificationFailure();
      }
    }, 30000);
  }

  private finishVerificationFailure(): void {
    if (this.verificationResolved) {
      return;
    }
    this.verificationResolved = true;
    this.clearVerificationTimers();
    this.verificationLoading = false;
    this.verificationError = 'Payment verification failed. Please try again.';
  }

  private clearVerificationTimers(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    if (this.verificationDeadlineTimer) {
      clearTimeout(this.verificationDeadlineTimer);
      this.verificationDeadlineTimer = null;
    }
    if (this.processingGuardTimer) {
      clearTimeout(this.processingGuardTimer);
      this.processingGuardTimer = null;
    }
  }

  private startProcessingGuard(): void {
    this.processingGuardTimer = setTimeout(() => {
      if (!this.verificationResolved && this.verificationLoading) {
        this.finishVerificationFailure();
      }
    }, 45000);
  }

  private loadVerificationMembershipState(): void {
    const authUser = this.authService.getAuthUser();
    if (!authUser?.id) {
      return;
    }

    this.verificationService.getStatus(authUser.id).pipe(
      timeout(7000),
    ).subscribe({
      next: (status) => {
        this.applyVerificationStatus(status);
      },
      error: () => {
        this.isVerified = !!authUser.verified;
      },
    });
  }

  private applyVerificationStatus(status: PaymentStatusResponse): void {
    this.isVerified = status.verified === true;
    this.verificationPlanLabel = this.toPlanLabel(status.planName);
    this.verifiedSinceLabel = this.toVerifiedSinceLabel(status);
  }

  private toPlanLabel(planName?: string): string {
    const sourceName = (planName ?? '').trim();
    const normalized = sourceName.toUpperCase();
    if (!normalized) {
      return 'Verified Membership';
    }
    if (normalized.includes('YEAR')) {
      return 'Verified Yearly';
    }
    if (normalized.includes('MONTH')) {
      return 'Verified Monthly';
    }
    return sourceName.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private toVerifiedSinceLabel(status: PaymentStatusResponse): string {
    const rawActivatedAt = (status as PaymentStatusResponse & { activatedAt?: string; createdAt?: string; verifiedAt?: string });
    const directDate = rawActivatedAt.activatedAt ?? rawActivatedAt.createdAt ?? rawActivatedAt.verifiedAt;
    const parsedDirect = this.parseDate(directDate);
    if (parsedDirect) {
      return this.formatMonthYear(parsedDirect);
    }

    const expiry = this.parseDate(status.expiryDate);
    if (!expiry) {
      return '';
    }

    const days = (status.planName ?? '').toUpperCase().includes('YEAR') ? 365 : 30;
    const activated = new Date(expiry.getTime() - (days * 24 * 60 * 60 * 1000));
    return this.formatMonthYear(activated);
  }

  private parseDate(value?: string): Date | null {
    if (!value?.trim()) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatMonthYear(value: Date): string {
    return value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
}
