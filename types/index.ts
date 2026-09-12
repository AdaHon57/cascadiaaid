export interface UserProfile {
  id: string;
  displayName?: string;
  email?: string;
}

export interface Document {
  id: string;
  name: string;
  createdAt?: string;
}

export interface TaskNode {
  id: string;
  title: string;
  status?: "pending" | "active" | "complete";
}

export interface Program {
  id: string;
  name: string;
  description?: string;
}
