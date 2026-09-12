export type ConnectionStatus = "unknown" | "healthy" | "invalid" | "limited" | "offline";

export interface Connection {
  status: ConnectionStatus;
  expiresAt: string | null;
  checkedAt: number;
  retryAt: number;
}

export interface Repository {
  id: number;
  owner: string;
  name: string;
  branch: string;
  private: boolean;
  description: string;
  commitSha: string | null;
  treeSha: string | null;
  checkedAt: number;
  authorization: string;
}

export interface VaultFile {
  path: string;
  sha: string;
  size: number;
}

export interface Snapshot {
  repository: Repository;
  treeSha: string;
  commitSha: string;
  files: VaultFile[];
}

export interface RecentNote {
  path: string;
  updatedAt: string;
}

export interface RecentPage {
  commitSha: string;
  items: RecentNote[];
  next: number | null;
}

export type SyncResult = Snapshot | { unchanged: true; repository: Repository };

export interface DocumentContent {
  path: string;
  sha: string;
  treeSha: string;
  content: string;
}

export interface Session {
  email: string;
  local: boolean;
  connection: Connection;
}

export interface AuthorProfile {
  name: string | null;
  avatar: string | null;
}

export interface ApiFailure {
  code: string;
  message: string;
  retryAt?: number;
}

export const scenarios = [
  "healthy",
  "slow",
  "expiring",
  "invalid",
  "limited",
  "offline",
  "updated",
] as const;
export type Scenario = (typeof scenarios)[number];
