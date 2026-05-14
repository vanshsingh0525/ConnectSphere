export interface StoryMediaItem {
  storyId: string;
  userId?: number;
  reactionTargetId: number;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewedByCurrentUser: boolean;
}

export interface StoryItem {
  id: string;
  highlightId?: number;
  userId?: number;
  name: string;
  username?: string;
  verified?: boolean;
  avatarColor: string;
  avatarUrl?: string;
  hasUnseen?: boolean;
  stories?: StoryMediaItem[];
  isAddStory?: boolean;
}

export type PostMediaType = 'image' | 'video' | 'none';

export interface FeedPostItem {
  id: number;
  authorId: number;
  userName: string;
  userHandle: string;
  userAvatarColor: string;
  userAvatarUrl?: string;
  userVerified?: boolean;
  timeAgo: string;
  content: string;
  mediaType: PostMediaType;
  mediaUrl?: string;
  location?: string;
  hashtags: string[];
  taggedUsers?: string[];
  likes: number;
  isLiked?: boolean;
  isSaved?: boolean;
  comments: number;
  shares: number;
}

export interface SuggestedUserItem {
  id: number;
  username: string;
  tagline: string;
  avatarColor: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface PlatformUpdateItem {
  id: number;
  title: string;
  description: string;
  dateLabel: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  description: string;
  dateLabel: string;
}
