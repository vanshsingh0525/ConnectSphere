import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-overview',
  standalone: true,
  imports: [CommonModule],
  template: `
  <section class="grid cards">
    <article class="stat" *ngFor="let item of stats">
      <p class="icon">{{ item.icon }}</p>
      <h3>{{ item.value }}</h3>
      <p>{{ item.label }}</p>
    </article>
  </section>

  <section class="grid two">
    <article class="panel">
      <h3>Platform Performance</h3>
      <div class="bars">
        <div class="bar" *ngFor="let bar of bars" [style.--size]="bar.value + '%'">
          <span>{{ bar.label }}</span>
          <strong>{{ bar.value }}%</strong>
        </div>
      </div>
    </article>

    <article class="panel">
      <h3>Recent Admin Activity</h3>
      <p class="empty" *ngIf="!activities.length">No recent activity logs.</p>
      <ul *ngIf="activities.length">
        <li *ngFor="let item of activities">{{ item }}</li>
      </ul>
    </article>
  </section>
  `,
  styles: [`
  .grid{display:grid;gap:1rem}.cards{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
  .stat{padding:1rem;border-radius:16px;border:1px solid rgba(140,162,255,.28);background:linear-gradient(145deg,rgba(63,94,251,.18),rgba(109,40,217,.14));box-shadow:0 14px 30px rgba(20,35,80,.25);transition:transform .2s ease}
  .stat:hover{transform:translateY(-3px)}.icon{margin:0 0 .4rem;font-size:1.2rem}.stat h3{margin:0;font-size:1.6rem}.stat p{margin:.3rem 0 0;color:#c8d6ff}
  .two{grid-template-columns:1.2fr .8fr}.panel{padding:1rem;border-radius:16px;border:1px solid rgba(140,162,255,.26);background:rgba(16,26,54,.6)}
  .bars{display:grid;gap:.7rem}.bar{display:grid;gap:.35rem}.bar span{color:#bdd0ff;font-size:.88rem}.bar strong{font-size:.86rem;color:#eff4ff}
  .bar::after{content:'';height:8px;border-radius:999px;background:linear-gradient(90deg,#4f75ff,var(--c,#22d3ee));width:var(--size)}
  ul{margin:0;padding-left:1.1rem}.empty{color:#9fb3e8}
  @media (max-width:900px){.two{grid-template-columns:1fr}}
  `],
})
export class AdminOverviewComponent implements OnInit {
  stats = [
    { label: 'Total Users', value: 0, icon: '??' },
    { label: 'Total Posts', value: 0, icon: '??' },
    { label: 'Total Comments', value: 0, icon: '??' },
    { label: 'Total Likes', value: 0, icon: '??' },
    { label: 'Active Users', value: 0, icon: '??' },
    { label: 'Verified Users', value: 0, icon: '?' },
    { label: 'Reports', value: 0, icon: '??' },
    { label: 'Trending Hashtags', value: 0, icon: '??' },
  ];

  bars = [
    { label: 'User Growth', value: 64 },
    { label: 'Post Activity', value: 72 },
    { label: 'Engagement', value: 58 },
    { label: 'Verification Subs', value: 44 },
  ];

  activities: string[] = [];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    forkJoin({
      users: this.adminApi.getUsers().pipe(catchError(() => of([]))),
      posts: this.adminApi.getPosts().pipe(catchError(() => of([]))),
      comments: this.adminApi.getComments().pipe(catchError(() => of([]))),
      reports: this.adminApi.getReports().pipe(catchError(() => of([]))),
      hashtags: this.adminApi.getHashtags('', 50).pipe(catchError(() => of([]))),
      analytics: this.adminApi.getAnalytics().pipe(catchError(() => of({}))),
    }).subscribe(({ users, posts, comments, reports, hashtags, analytics }) => {
      const userList = users as Array<Record<string, unknown>>;
      const postList = posts as Array<Record<string, unknown>>;
      const commentList = comments as Array<Record<string, unknown>>;
      const reportList = reports as Array<Record<string, unknown>>;
      const hashtagList = hashtags as Array<Record<string, unknown>>;
      const verifiedUsers = userList.filter((u) => Boolean(u['verified'])).length;
      const activeUsers = userList.filter((u) => String(u['status'] ?? 'ACTIVE').toUpperCase() !== 'SUSPENDED').length;
      const likes = postList.reduce((sum, p) => sum + Number(p['likesCount'] ?? 0), 0);

      this.stats = [
        { label: 'Total Users', value: userList.length, icon: '??' },
        { label: 'Total Posts', value: postList.length, icon: '??' },
        { label: 'Total Comments', value: commentList.length, icon: '??' },
        { label: 'Total Likes', value: likes, icon: '??' },
        { label: 'Active Users', value: activeUsers, icon: '??' },
        { label: 'Verified Users', value: verifiedUsers, icon: '?' },
        { label: 'Reports', value: reportList.length, icon: '??' },
        { label: 'Trending Hashtags', value: hashtagList.length, icon: '??' },
      ];

      const metrics = analytics as Record<string, unknown>;
      this.bars = [
        { label: 'User Growth', value: Math.min(100, Math.max(15, Number(metrics['userGrowth'] ?? 64))) },
        { label: 'Post Activity', value: Math.min(100, Math.max(15, Number(metrics['postGrowth'] ?? 72))) },
        { label: 'Engagement', value: Math.min(100, Math.max(15, Number(metrics['engagement'] ?? 58))) },
        { label: 'Verification Subs', value: Math.min(100, Math.max(15, Number(metrics['verificationSubs'] ?? 44))) },
      ];

      this.activities = reportList.slice(0, 6).map((r) => `Report #${r['id']} on ${r['targetType']} marked ${r['status']}`);
    });
  }
}
