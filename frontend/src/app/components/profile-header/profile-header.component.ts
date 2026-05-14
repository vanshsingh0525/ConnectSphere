import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { ProfileSummary } from '../../models/profile-ui.model';
import { VerifiedBadgeComponent } from '../verified-badge/verified-badge.component';

@Component({
  selector: 'app-profile-header',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective, VerifiedBadgeComponent],
  templateUrl: './profile-header.component.html',
  styleUrl: './profile-header.component.css',
})
export class ProfileHeaderComponent {
  @Input({ required: true }) profile!: ProfileSummary;
  @Input() isOwnProfile = false;
  @Input() isFollowing = false;
  @Input() isPending = false;
  @Input() followBusy = false;
  @Input() hasActiveStory = false;
  @Output() editProfile = new EventEmitter<void>();
  @Output() toggleFollow = new EventEmitter<void>();
  @Output() addStory = new EventEmitter<void>();
  @Output() viewStory = new EventEmitter<void>();
  @Output() openPosts = new EventEmitter<void>();
  @Output() openFollowers = new EventEmitter<void>();
  @Output() openFollowing = new EventEmitter<void>();
}
