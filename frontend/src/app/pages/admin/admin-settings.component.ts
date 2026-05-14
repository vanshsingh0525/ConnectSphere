import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="settings-grid">
    <article class="panel">
      <h3>Admin Preferences</h3>
      <label><input type="checkbox" [(ngModel)]="emailAlerts" /> Email alerts for severe reports</label>
      <label><input type="checkbox" [(ngModel)]="autoArchive" /> Auto-archive resolved reports</label>
      <p class="note">Preferences are local UI settings for this dashboard session.</p>
    </article>

    <article class="panel">
      <h3>Audit Logs</h3>
      <p class="note" *ngIf="!auditLogs.length">No logs available.</p>
      <ul *ngIf="auditLogs.length"><li *ngFor="let log of auditLogs">{{ log }}</li></ul>
    </article>
  </section>
  `,
  styles: [`
  .settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:.9rem}.panel{padding:1rem;border-radius:16px;border:1px solid rgba(141,165,251,.28);background:rgba(14,23,50,.64)}
  label{display:flex;gap:.5rem;align-items:center;margin:.55rem 0;color:#d9e6ff}.note{color:#9ab0df}ul{margin:0;padding-left:1rem}
  `],
})
export class AdminSettingsComponent implements OnInit {
  emailAlerts = true;
  autoArchive = false;
  auditLogs: string[] = [];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.adminApi.getAuditLogs().subscribe((rows) => {
      this.auditLogs = rows.slice(0, 12).map((row) => `${row['action'] ?? 'ACTION'} on ${row['targetType'] ?? 'TARGET'} (#${row['targetId'] ?? '-'})`);
    });
  }
}
