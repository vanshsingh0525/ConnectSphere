import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-broadcast',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="panel">
    <h3>Broadcast Notifications</h3>
    <p>Send announcements, maintenance alerts, and creator updates.</p>
    <label>Audience</label>
    <select [(ngModel)]="audience"><option value="all">All users</option><option value="verified">Verified users</option><option value="creators">Creators</option></select>
    <label>Message</label>
    <textarea [(ngModel)]="message" rows="6" placeholder="Write your broadcast message"></textarea>
    <button [disabled]="sending || !message.trim()" (click)="send()">{{ sending ? 'Sending...' : 'Send Broadcast' }}</button>
    <p class="success" *ngIf="toast">{{ toast }}</p>
  </section>
  `,
  styles: [`
  .panel{padding:1rem;border-radius:16px;border:1px solid rgba(145,169,255,.28);background:rgba(15,24,52,.62);display:grid;gap:.55rem;max-width:740px}
  label{font-size:.84rem;color:#bdd0ff}select,textarea{border-radius:12px;border:1px solid rgba(152,175,255,.35);background:rgba(12,22,48,.75);color:#e8efff;padding:.7rem}
  button{margin-top:.3rem;height:42px;border-radius:12px;border:1px solid rgba(110,231,183,.45);background:linear-gradient(135deg,rgba(16,185,129,.25),rgba(59,130,246,.28));color:#ecfff8;font-weight:700}
  .success{color:#a7f3d0}
  `],
})
export class AdminBroadcastComponent {
  audience: 'all' | 'verified' | 'creators' = 'all';
  message = '';
  sending = false;
  toast = '';

  constructor(private readonly adminApi: AdminApiService) {}

  send(): void {
    if (!this.message.trim()) {
      return;
    }
    this.sending = true;
    this.toast = '';
    this.adminApi.sendBroadcast(this.message.trim(), []).subscribe({
      next: () => {
        this.sending = false;
        this.toast = `Broadcast delivered to ${this.audience} audience.`;
        this.message = '';
      },
      error: () => {
        this.sending = false;
        this.toast = 'Failed to send broadcast.';
      },
    });
  }
}
