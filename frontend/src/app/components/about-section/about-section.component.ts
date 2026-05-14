import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';

import { AnnouncementItem, PlatformUpdateItem } from '../../models/dashboard-ui.model';

interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}

interface WhyItem {
  title: string;
  description: string;
  points: string[];
}

@Component({
  selector: 'app-about-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about-section.component.html',
  styleUrl: './about-section.component.css',
})
export class AboutSectionComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() updates: PlatformUpdateItem[] = [];
  @Input() announcements: AnnouncementItem[] = [];

  @ViewChildren('revealCard')
  private readonly revealCards!: QueryList<ElementRef<HTMLElement>>;

  private observer: IntersectionObserver | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private statsStep = 0;
  private readonly statsFrames = 42;

  readonly featureCards: FeatureCard[] = [
    { icon: 'ST', title: 'Stories & Highlights', description: 'Share moments instantly and preserve signature stories on your profile.' },
    { icon: 'SS', title: 'Smart Search', description: 'Find creators, communities, and conversations with fast relevance-first search.' },
    { icon: 'RN', title: 'Realtime Notifications', description: 'Stay in sync with likes, mentions, follows, comments, and social activity.' },
    { icon: 'CV', title: 'Creator Verification', description: 'Build trust with visible identity badges and premium verified presence.' },
    { icon: 'SF', title: 'Social Feed', description: 'Enjoy a smooth feed optimized for discovery, expression, and interaction.' },
    { icon: 'PC', title: 'Privacy Controls', description: 'Switch between private and public sharing with granular audience control.' },
    { icon: 'MS', title: 'Messaging', description: 'Connect directly with followers and collaborators using seamless messaging.' },
    { icon: 'TH', title: 'Trending Hashtags', description: 'Track what is rising in real time and join relevant community moments.' },
  ];

  readonly whyItems: WhyItem[] = [
    {
      title: 'Real-time interaction',
      description: 'From stories to notifications, ConnectSphere keeps every interaction immediate and alive.',
      points: ['Instant feedback loops', 'Live social context', 'High-retention interaction design'],
    },
    {
      title: 'Creator-first platform',
      description: 'Built for creators who need beautiful publishing, profile credibility, and audience growth.',
      points: ['Publishing confidence', 'Audience discoverability', 'Creator-friendly control surface'],
    },
    {
      title: 'Verified identity system',
      description: 'Our verification flow reinforces trust, authenticity, and responsible digital presence.',
      points: ['Identity trust signals', 'Community safety emphasis', 'Premium profile confidence'],
    },
    {
      title: 'Clean modern experience',
      description: 'Every surface is crafted with calm spacing, focused typography, and motion that feels natural.',
      points: ['Intentional minimalism', 'Elegant hierarchy', 'Cross-device visual consistency'],
    },
  ];

  readonly stats = [
    { label: 'Community Interactions', value: 50000, suffix: '+' },
    { label: 'Stories Shared', value: 10000, suffix: '+' },
    { label: 'Verified Profiles', value: 5000, suffix: '+' },
    { label: 'Fast Performance', value: 99.9, suffix: '%' },
  ];

  statDisplayValues = this.stats.map(() => 0);

  get timelineItems(): Array<PlatformUpdateItem | AnnouncementItem> {
    return [...this.updates, ...this.announcements];
  }

  ngOnInit(): void {
    this.startStatsAnimation();
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 },
    );

    this.revealCards.forEach((card) => this.observer?.observe(card.nativeElement));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  formatStat(index: number): string {
    const value = this.statDisplayValues[index] ?? 0;
    if (this.stats[index]?.suffix === '%') {
      return value.toFixed(1);
    }
    if (value >= 1000) {
      return value % 1000 === 0 ? `${Math.round(value / 1000)}k` : `${(value / 1000).toFixed(1)}k`;
    }
    return `${Math.round(value)}`;
  }

  private startStatsAnimation(): void {
    this.statsStep = 0;
    this.statsTimer = setInterval(() => {
      this.statsStep += 1;
      const progress = Math.min(1, this.statsStep / this.statsFrames);
      this.statDisplayValues = this.stats.map((item) => Number((item.value * progress).toFixed(1)));

      if (progress >= 1 && this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
    }, 30);
  }
}
