import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { AdminApiService, AdminReport } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule],
  template: `
  <section class="report-grid">
    <article class="report" *ngFor="let report of reports" [class.pending]="report.status==='PENDING'" [class.review]="report.status==='UNDER_REVIEW'" [class.resolved]="report.status==='RESOLVED'">
      <header><strong>#{{ report.id }} · {{ report.targetType }}</strong><span class="chip">{{ report.status }}</span></header>
      <p>{{ report.reason }}</p>
      <small>Target: {{ report.targetId }}</small>
      <div class="actions">
        <button (click)="resolve(report, 'UNDER_REVIEW')">Under Review</button>
        <button (click)="resolve(report, 'REMOVED')">Remove Content</button>
        <button (click)="resolve(report, 'WARNED')">Warn User</button>
        <button (click)="resolve(report, 'SUSPENDED')">Suspend User</button>
        <button (click)="resolve(report, 'RESOLVED')">Mark Resolved</button>
      </div>
    </article>
  </section>
  `,
  styles: [`
  .report-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.9rem}.report{padding:.9rem;border-radius:14px;border:1px solid rgba(138,162,245,.28);background:rgba(15,24,51,.62)}
  .report.pending{box-shadow:0 0 0 1px rgba(251,191,36,.35)}.report.review{box-shadow:0 0 0 1px rgba(56,189,248,.34)}.report.resolved{box-shadow:0 0 0 1px rgba(74,222,128,.35)}
  header{display:flex;justify-content:space-between;gap:.4rem}.chip{font-size:.72rem;border-radius:999px;padding:.15rem .5rem;background:rgba(255,255,255,.08)}p{color:#d7e4ff}.actions{display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-top:.6rem}
  button{height:30px;border-radius:9px;border:1px solid rgba(147,170,255,.35);background:rgba(255,255,255,.05);color:#e7efff;font-size:.75rem}
  `],
})
export class AdminReportsComponent implements OnInit {
  reports: AdminReport[] = [];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.refresh();
  }

  resolve(report: AdminReport, action: string): void {
    this.adminApi.resolveReport(report.id, action).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.adminApi.getReports().subscribe((rows) => {
      this.reports = rows.map((row) => ({ ...row, status: String(row.status ?? 'PENDING').toUpperCase() }));
    });
  }
}
