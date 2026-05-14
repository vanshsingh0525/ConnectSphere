import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { SuggestedUserItem } from '../../models/dashboard-ui.model';
import { VerifiedBadgeComponent } from '../verified-badge/verified-badge.component';

@Component({
  selector: 'app-suggestions',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective, VerifiedBadgeComponent],
  templateUrl: './suggestions.component.html',
  styleUrl: './suggestions.component.css',
})
export class SuggestionsComponent {
  @Input() users: SuggestedUserItem[] = [];
  @Output() userSelected = new EventEmitter<string>();
  showAll = false;

  readonly footerLinks = ['About', 'Help', 'Press', 'API', 'Jobs', 'Privacy', 'Terms'];
  readonly collapsedLimit = 6;

  get visibleUsers(): SuggestedUserItem[] {
    if (this.showAll) {
      return this.users;
    }
    return this.users.slice(0, this.collapsedLimit);
  }

  get canToggleSeeAll(): boolean {
    return this.users.length > this.collapsedLimit;
  }

  toggleSeeAll(): void {
    if (!this.canToggleSeeAll) {
      return;
    }
    this.showAll = !this.showAll;
  }

  openProfile(username: string): void {
    const normalized = username.replace('@', '').trim();
    if (normalized) {
      this.userSelected.emit(normalized);
    }
  }
}
