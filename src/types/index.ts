export type UserRole = 'CAPTAIN' | 'TEAM_LEAD' | 'MEMBER';

export type AppView =
  | 'dashboard'
  | 'teams'
  | 'notebooks'
  | 'posts'
  | 'queries'
  | 'admin'
  | 'members'
  | 'innovation'
  | 'workspace';

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink: string;
  teamId?: string;
  category: 'PROGRESS' | 'BILLS';
}

export interface BillingMetadata {
  teamId: string;
  amount: number;
  date: string;
}



export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  teams?: { teamId: string; status: 'PENDING' | 'APPROVED' }[];
  approvedTeams?: string[];
  createdAt: string;
  isOnline?: boolean;
  lastActive?: any;
  department?: string;
  year?: string;
}

export interface Subsystem {
  id: string;
  name: string;
  headId: string;
  headName?: string;
  progress: number;
  riskScore: number;
  readiness: number;
  status: string;
  pendingTasks: number;
  color: string;
}

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Task {
  id: string;
  subsystem: string;
  taskType?: 'REPORT' | 'MANUFACTURING';
  workstream?: 'R&D' | 'Hardware' | 'Software';
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: string;       // display name or email
  assignedToId?: string;    // uid for lookup
  createdBy: string;
  createdByName?: string;
  startDate?: string;       // ISO date
  deadline: string;
  progressPercent?: number; // 0-100
  attendance?: 'Present' | 'Work from home' | 'Absent' | 'On Duty' | 'Pending';
  todayProgress?: string;
  nextAction?: string;
  resourcesNeeded?: string;
  event?: string;
  remarks?: string;
  dependencies?: string[];  // task IDs
  delayProbability: number;
  aiSuggestions: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TaskUpdate {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  progressPercent: number;
  attendance: string;
  todayProgress: string;
  nextAction: string;
  resourcesNeeded: string;
  event: string;
  remarks: string;
  createdAt: any;
}

export interface Post {
  id: string;
  type: 'GENERAL' | 'TEAM';
  teamId?: string;
  content: string;
  imageUrl?: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: any;
}

export interface Query {
  id: string;
  title: string;
  content: string;
  attachmentUrl?: string;
  status: 'OPEN' | 'RESOLVED';
  authorId: string;
  authorName: string;
  createdAt: any;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  type: 'RESEARCH' | 'EXPERIMENT' | 'FAILURE' | 'SKETCH' | 'GENERAL';
  subsystem?: string;
  tags?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InnovationLog {
  id: string;
  title: string;
  description: string;
  category: 'WEIGHT' | 'COOLING' | 'EFFICIENCY' | 'BATTERY' | 'AERO';
  upvotes: number;
  submittedBy: string;
  aiFeedback?: string;
}

export interface SchedulePhase {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
}

export interface Schedule {
  id: string;
  raceDate: string;
  phases: SchedulePhase[];
  createdAt: any;
  updatedAt: any;
}

export interface PerformanceMetric {
  id: string;
  date: string;
  [key: string]: any;
}

export interface Document {
  id: string;
  title: string;
  url?: string;
  [key: string]: any;
}
