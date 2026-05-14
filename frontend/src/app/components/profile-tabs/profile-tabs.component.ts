import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ProfileTabType } from '../../models/profile-ui.model';

@Component({
  selector: 'app-profile-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-tabs.component.html',
  styleUrl: './profile-tabs.component.css',
})
export class ProfileTabsComponent {
  @Input() activeTab: ProfileTabType = 'posts';
  @Input() showSavedTab = true;

  @Output() tabChange = new EventEmitter<ProfileTabType>();

  readonly tabs: Array<{ key: ProfileTabType; label: string; icon: string }> = [
    { key: 'posts', label: 'Posts', icon: 'G' },
    { key: 'saved', label: 'Saved', icon: 'S' },
    { key: 'tagged', label: 'Tagged', icon: 'T' },
  ];

  get visibleTabs(): Array<{ key: ProfileTabType; label: string; icon: string }> {
    return this.tabs.filter((tab) => this.showSavedTab || tab.key !== 'saved');
  }

  setTab(tab: ProfileTabType): void {
    this.tabChange.emit(tab);
  }
}
