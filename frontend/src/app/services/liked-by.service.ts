import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { AuthService, PublicUserProfile } from './auth.service';
import { ReactionService, ReactionTargetType, ReactionType, ReactionUserResponse } from './reaction.service';
import { DEFAULT_AVATAR_URL } from '../utils/avatar.util';

export interface LikedByAccount {
  userId: number;
  username: string;
  name: string;
  profileImageUrl: string;
  reactedAt: string;
  reactionType: ReactionType;
}

@Injectable({
  providedIn: 'root',
})
export class LikedByService {
  constructor(
    private readonly reactionService: ReactionService,
    private readonly authService: AuthService,
  ) {}

  getAccounts(targetId: number, targetType: ReactionTargetType = 'POST', reactionType: ReactionType = 'LIKE'): Observable<LikedByAccount[]> {
    return this.reactionService.getUsers(targetId, targetType, reactionType).pipe(
      switchMap((reactions) =>
        this.authService.getPublicProfiles().pipe(
          map((profiles) => this.mapAccounts(reactions, profiles)),
          catchError(() => of(this.mapAccounts(reactions, []))),
        ),
      ),
    );
  }

  private mapAccounts(reactions: ReactionUserResponse[], profiles: PublicUserProfile[]): LikedByAccount[] {
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return reactions.map((reaction) => {
      const profile = profileMap.get(reaction.userId);
      return {
        userId: reaction.userId,
        username: profile?.username ?? `user${reaction.userId}`,
        name: profile?.name ?? 'ConnectSphere User',
        profileImageUrl: profile?.profileImageUrl || DEFAULT_AVATAR_URL,
        reactedAt: reaction.reactedAt,
        reactionType: reaction.reactionType,
      };
    });
  }
}
