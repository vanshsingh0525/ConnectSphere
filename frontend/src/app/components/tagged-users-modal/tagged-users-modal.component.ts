import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-tagged-users-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tagged-users-modal.component.html',
  styleUrl: './tagged-users-modal.component.css',
})
export class TaggedUsersModalComponent {
  @Input() taggedUsers: Array<{ username: string; name: string }> = [];
  @Input() open = false;
  @Input() title = 'Tagged people';
  @Output() closed = new EventEmitter<void>();
  @Output() userSelected = new EventEmitter<string>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) {
      this.closed.emit();
    }
  }

  close(): void {
    this.closed.emit();
  }

  openUser(username: string): void {
    const normalized = username.trim().replace(/^@/, '');
    if (!normalized) {
      return;
    }

    this.userSelected.emit(normalized);
  }

  avatarLabel(username: string): string {
    return username.trim().replace(/^@/, '').slice(0, 1).toUpperCase() || '?';
  }

  displayUsername(username: string): string {
    return username.trim().replace(/^@/, '');
  }
}
