export const ROLES = {
  CAPTAIN: 'Team Captain',
  TEAM_LEAD: 'Team Lead',
  MEMBER: 'Team Member'
} as const;

export type Permission =
  | 'MANAGE_TASKS'
  | 'VIEW_ALL_TEAMS'
  | 'VIEW_TEAM_ONLY'
  | 'CREATE_POST_GLOBAL'
  | 'CREATE_POST_TEAM'
  | 'RAISE_QUERY'
  | 'RESOLVE_QUERY'
  | 'VIEW_PRIVATE_QUERIES'
  | 'VIEW_ALL_MEMBERS'
  | 'VIEW_TEAM_MEMBERS';

export const ROLE_PERMISSIONS: Record<keyof typeof ROLES, Permission[]> = {
  CAPTAIN: [
    'MANAGE_TASKS', 'VIEW_ALL_TEAMS', 'CREATE_POST_GLOBAL', 'CREATE_POST_TEAM',
    'RAISE_QUERY', 'RESOLVE_QUERY', 'VIEW_PRIVATE_QUERIES', 'VIEW_ALL_MEMBERS'
  ],
  TEAM_LEAD: [
    'MANAGE_TASKS', 'VIEW_TEAM_ONLY', 'CREATE_POST_GLOBAL', 'CREATE_POST_TEAM',
    'RAISE_QUERY', 'VIEW_TEAM_MEMBERS'
  ],
  MEMBER: [
    'VIEW_TEAM_ONLY', 'RAISE_QUERY', 'VIEW_TEAM_MEMBERS'
  ]
};

export const DEFAULT_SUBSYSTEMS = [
  { id: 'steering', name: 'Steering' },
  { id: 'suspension', name: 'Suspension' },
  { id: 'brakes', name: 'Brakes' },
  { id: 'transmission', name: 'Transmission' },
  { id: 'design', name: 'Design' },
  { id: 'electrical', name: 'Electricals' },
  { id: 'innovation', name: 'Innovation' },
  { id: 'autonomous', name: 'Autonomous' },
  { id: 'cost', name: 'Cost' },
  { id: 'pro', name: 'PRO' }
];
