import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css',
})
export class LandingPageComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('revealSection')
  private readonly revealSections!: QueryList<ElementRef<HTMLElement>>;

  private observer: IntersectionObserver | null = null;

  constructor(private readonly router: Router) {}

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('section-visible');
          }
        });
      },
      {
        threshold: 0.22,
      },
    );

    this.revealSections.forEach((section) => this.observer?.observe(section.nativeElement));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  goToSignup(): void {
    void this.router.navigate(['/signup'], { queryParams: { mode: 'signup' } });
  }

  goToPublicFeed(): void {
    void this.router.navigate(['/dashboard']);
  }
}
