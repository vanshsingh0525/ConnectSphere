import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

import { MoreMenuComponent } from '../more-menu/more-menu.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MoreMenuComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  @ViewChild('createFileInput')
  private readonly createFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('moreTrigger')
  private readonly moreTrigger?: ElementRef<HTMLButtonElement>;

  @Input() notificationCount = 0;
  @Input() activeItem = 'Home';
  @Input() darkMode = false;
  @Input() createBehavior: 'file-picker' | 'wizard' = 'file-picker';

  @Output() itemSelected = new EventEmitter<string>();
  @Output() fileSelected = new EventEmitter<File>();
  @Output() createRequested = new EventEmitter<void>();

  expanded = false;
  isMoreOpen = false;
  moreMenuTop = 0;
  moreMenuLeft = 0;

  readonly items = [
    { label: 'About Us', icon: 'I' },
    { label: 'Home', icon: 'H' },
    { label: 'Search', icon: 'S' },
    { label: 'Notifications', icon: 'N' },
    { label: 'Create', icon: '+' },
    { label: 'Profile', icon: 'P' },
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  get currentUser() {
    return this.authService.getAuthUser();
  }

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  get isAdminUser(): boolean {
    return this.authService.hasAdminAccess();
  }

  get visibleItems(): Array<{ label: string; icon: string }> {
    if (!this.isAuthenticated) {
      return this.items.filter((item) => item.label === 'About Us' || item.label === 'Home' || item.label === 'Search');
    }

    return this.items;
  }

  onItemClick(label: string): void {
    this.isMoreOpen = false;

    if (label === 'Create') {
      if (this.createBehavior === 'wizard') {
        this.createRequested.emit();
        return;
      }

      this.openFilePicker();
      return;
    }

    this.itemSelected.emit(label);
  }

  onCreateFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.fileSelected.emit(file);
    input.value = '';
  }

  toggleMore(): void {
    if (this.isMoreOpen) {
      this.isMoreOpen = false;
      return;
    }

    this.updateMoreMenuPosition();
    this.isMoreOpen = true;
  }

  openSettings(): void {
    this.isMoreOpen = false;
    void this.router.navigate(['/settings']);
  }

  openAdminConsole(): void {
    this.isMoreOpen = false;
    void this.router.navigate(['/admin/dashboard']);
  }

  logout(): void {
    this.isMoreOpen = false;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.authService.clearSession();
    void this.router.navigate(['/login']);
  }

  goToLogin(): void {
    this.isMoreOpen = false;
    void this.router.navigate(['/login']);
  }

  goToSignup(): void {
    this.isMoreOpen = false;
    void this.router.navigate(['/signup'], { queryParams: { mode: 'signup' } });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isMoreOpen = false;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (!this.isMoreOpen) {
      return;
    }

    this.updateMoreMenuPosition();
  }

  onMoreMenuClick(event: Event): void {
    event.stopPropagation();
  }

  private openFilePicker(): void {
    this.createFileInput?.nativeElement.click();
  }

  private updateMoreMenuPosition(): void {
    const trigger = this.moreTrigger?.nativeElement;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(220, Math.max(180, window.innerWidth - 32));
    const preferredLeft = rect.right + 12;
    const fallbackLeft = rect.left - menuWidth + rect.width;
    const maxLeft = Math.max(16, window.innerWidth - menuWidth - 16);

    this.moreMenuLeft = preferredLeft + menuWidth <= window.innerWidth - 16
      ? preferredLeft
      : Math.min(maxLeft, Math.max(16, fallbackLeft));
    this.moreMenuTop = Math.min(window.innerHeight - 120, Math.max(16, rect.bottom - 54));
  }
}
