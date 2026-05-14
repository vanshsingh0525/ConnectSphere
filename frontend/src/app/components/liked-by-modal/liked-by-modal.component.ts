import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { LikedByAccount } from '../../services/liked-by.service';

@Component({
  selector: 'app-liked-by-modal',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective],
  templateUrl: './liked-by-modal.component.html',
  styleUrl: './liked-by-modal.component.css',
})
export class LikedByModalComponent {
  @Input() open = false;
  @Input() title = 'Likes';
  @Input() emptyMessage = 'No likes yet.';
  @Input() accounts: LikedByAccount[] = [];
  @Input() loading = false;
  @Input() errorMessage = '';
  @Output() closed = new EventEmitter<void>();
  @Output() accountSelected = new EventEmitter<string>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.closed.emit();
    }
  }

  close(): void {
    this.closed.emit();
  }

  openAccount(username: string): void {
    if (!username.trim()) {
      return;
    }

    this.accountSelected.emit(username);
  }
}
