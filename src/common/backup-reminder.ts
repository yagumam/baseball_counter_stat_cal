// 백업 알림: 마지막 백업 뒤에 바뀐 경기를 세어, 백업할 때까지 계속 알려 준다.
// 웹앱은 사용자가 누르지 않으면 파일을 저장하거나 보낼 수 없으므로, 자동 백업 대신 "한 번 누르기" 백업을 권한다.

import { Game } from './game';

const LAST_BACKUP_KEY = 'baseball-counter.last-backup';

/** 경기 기록이 마지막으로 바뀐 시각 (가장 늦은 이벤트, 없으면 만든 시각) */
export function lastChangeOf(game: Game): string {
  return game.events.reduce((latest, e) => (e.createdAt > latest ? e.createdAt : latest), game.createdAt);
}

/** 마지막 백업 뒤에 새로 생기거나 바뀐 경기. 백업한 적이 없으면 모든 경기 */
export function gamesChangedSince(games: readonly Game[], lastBackupAt: string | null): Game[] {
  return lastBackupAt === null ? [...games] : games.filter((g) => lastChangeOf(g) > lastBackupAt);
}

/** 저장된 값이 시각(ISO)이 아니면 백업한 적 없는 것으로 본다. */
export function parseBackupTime(raw: string | null): string | null {
  return raw !== null && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

export function loadLastBackup(): string | null {
  try {
    return parseBackupTime(localStorage.getItem(LAST_BACKUP_KEY));
  } catch {
    return null;
  }
}

export function saveLastBackup(at: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, at);
  } catch {
    // 기억하지 못하면 다음에 알림이 다시 뜰 뿐이다.
  }
}

const DISMISSED_KEY = 'baseball-counter.backup-reminder-dismissed';

/**
 * 알림 띠를 보여줄지. "무시하기"를 누른 뒤에는 그 뒤로 새로 바뀐 경기가 생길 때까지 띠를 숨긴다.
 * (무시해도 백업한 것은 아니므로 백업 안 한 경기 수는 그대로 센다)
 */
export function shouldShowReminder(games: readonly Game[], lastBackupAt: string | null, dismissedAt: string | null, minGames: number): boolean {
  if (gamesChangedSince(games, lastBackupAt).length < minGames) return false;
  return dismissedAt === null || games.some((g) => lastChangeOf(g) > dismissedAt);
}

export function loadReminderDismissed(): string | null {
  try {
    return parseBackupTime(localStorage.getItem(DISMISSED_KEY));
  } catch {
    return null;
  }
}

export function saveReminderDismissed(at: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, at);
  } catch {
    // 기억하지 못하면 다음에 띠가 다시 뜰 뿐이다.
  }
}
