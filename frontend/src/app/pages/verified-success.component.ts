import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, of, timeout } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-verified-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verified-success.component.html',
  styleUrl: './verified-success.component.css',
})
export class VerifiedSuccessComponent implements OnInit {
  username: string;
  readonly planName: string;
  refreshingProfile = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {
    this.username = this.route.snapshot.queryParamMap.get('username')?.trim() || 'connectsphere_user';
    this.planName = this.route.snapshot.queryParamMap.get('plan')?.trim() || 'VERIFIED_MONTHLY';
  }

  ngOnInit(): void {
    this.authService.refreshAuthState().subscribe({
      next: (user) => {
        this.username = user.username?.trim() || this.username;
      },
    });
  }

  goToProfile(): void {
    if (this.refreshingProfile) {
      return;
    }

    this.refreshingProfile = true;
    this.authService.refreshAuthState().pipe(
      timeout(7000),
      catchError(() => of(this.authService.getAuthUser())),
      finalize(() => {
        this.refreshingProfile = false;
      }),
    ).subscribe({
      next: (user) => {
        const targetUsername = user?.username?.trim();
        if (targetUsername) {
          void this.router.navigate(['/profile', targetUsername], { replaceUrl: true });
          return;
        }
        void this.router.navigate(['/dashboard'], { replaceUrl: true });
      },
      error: () => {
        const cached = this.authService.getAuthUser();
        const targetUsername = cached?.username?.trim() || this.username?.trim();
        if (targetUsername) {
          void this.router.navigate(['/profile', targetUsername], { replaceUrl: true });
          return;
        }
        void this.router.navigate(['/dashboard'], { replaceUrl: true });
      },
    });
  }

  goHome(): void {
    void this.router.navigate(['/dashboard']);
  }

  get displayUsername(): string {
    return this.username?.trim() || 'connectsphere_user';
  }

  get displayPlanName(): string {
    return this.planName?.trim() || 'VERIFIED_MONTHLY';
  }
}
