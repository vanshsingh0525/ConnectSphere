import { StoryMediaItem } from './dashboard-ui.model';

export interface ProfileSummary {
  userId: number;
  username: string;
  name: string;
  bio: string;
  avatarUrl: string;
  isPublic: boolean;
  verified?: boolean;
  postsLabel: string;
  followersLabel: string;
  followingLabel: string;
}

export interface HighlightItem {
  id: number;
  label: string;
  imageUrl: string;
  isNew?: boolean;
  stories?: StoryMediaItem[];
}

export interface ProfilePostItem {
  id: number;
  authorId: number;
  text: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'none';
  taggedUsers?: string[];
  likes: number;
  isLiked?: boolean;
  isSaved?: boolean;
  likeInFlight?: boolean;
  comments: number;
}

export type ProfileTabType = 'posts' | 'saved' | 'tagged';
