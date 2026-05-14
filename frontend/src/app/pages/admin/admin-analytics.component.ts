import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
  <section class="analytics-grid">
    <article class="chart-card" *ngFor="let chart of charts">
      <h3>{{ chart.title }}</h3>
      <div class="line">
        <span *ngFor="let point of chart.points" [style.height.%]="point"></span>
      </div>
      <p>{{ chart.caption }}</p>
    </article>
  </section>
  `,
  styles: [`
  .analytics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.chart-card{padding:1rem;border-radius:16px;border:1px solid rgba(134,157,247,.28);background:rgba(14,23,50,.62)}
  h3{margin:0 0 .7rem}.line{height:130px;display:flex;align-items:flex-end;gap:.35rem}span{flex:1;border-radius:8px 8px 4px 4px;background:linear-gradient(180deg,#60a5fa,#8b5cf6);box-shadow:0 0 8px rgba(99,102,241,.35);animation:rise .8s ease both}
  p{margin:.65rem 0 0;color:#b9cbf6}@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  `],
})
export class AdminAnalyticsComponent implements OnInit {
  charts = [
    { title: 'User Growth', points: [20, 40, 35, 55, 64, 70, 82], caption: 'Daily active user momentum' },
    { title: 'Post Activity', points: [10, 28, 45, 38, 60, 66, 74], caption: 'Posts created over time' },
    { title: 'Engagement Trends', points: [24, 32, 44, 58, 48, 62, 68], caption: 'Likes and comments trend' },
    { title: 'Verification Subscriptions', points: [12, 18, 26, 34, 30, 40, 52], caption: 'Premium verification growth' },
  ];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.adminApi.getAnalytics().subscribe((payload) => {
      const toSeries = (value: unknown, fallback: number[]) => {
        if (!Array.isArray(value)) {
          return fallback;
        }
        return value.map((entry) => Math.max(8, Math.min(96, Number(entry) || 0)));
      };

      this.charts = [
        { title: 'User Growth', points: toSeries(payload['userGrowthSeries'], this.charts[0].points), caption: 'Daily active user momentum' },
        { title: 'Post Activity', points: toSeries(payload['postGrowthSeries'], this.charts[1].points), caption: 'Posts created over time' },
        { title: 'Engagement Trends', points: toSeries(payload['engagementSeries'], this.charts[2].points), caption: 'Likes and comments trend' },
        { title: 'Verification Subscriptions', points: toSeries(payload['verificationSeries'], this.charts[3].points), caption: 'Premium verification growth' },
      ];
    });
  }
}
