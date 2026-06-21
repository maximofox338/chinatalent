// Shared TypeScript interfaces for China Talent Bridge.
// Imported by both apps/api and apps/web via the @chinatalent/shared package.
// Derived from API_CONTRACT.md, COMPONENT_SPECS.md and SCHEMA.sql.

/** Standard response envelope returned by ALL API endpoints. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  /** Present when `success` is true. */
  data?: T;
  /** Human-readable message present when `success` is false. */
  error?: string;
  /** Machine-readable identifier present when `success` is false. */
  code?: ErrorCode;
}

/** Known error identifiers (see API_CONTRACT.md "Error Codes"). */
export type ErrorCode =
  | 'USER_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'INVALID_INPUT'
  | 'PROJECT_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR';

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export type UserRole = 'worker' | 'employer' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName?: string;
  createdAt: string;
}

/** Returned after a successful magic-link verification. */
export interface AuthSession {
  /** JWT bearer token. */
  token: string;
  user: User;
}

// ---------------------------------------------------------------------------
// Freelance projects & applications
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  title: string;
  description: string;
  budget: number;
  timeline: string;
  employerId: string;
  createdAt: string;
}

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface Application {
  id: string;
  projectId: string;
  workerId: string;
  status: ApplicationStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Full-time employment
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  title: string;
  description: string;
  /** Annual salary in USD. */
  salary: number;
  employerId: string;
  createdAt: string;
}

export type OfferStatus = 'pending' | 'accepted' | 'declined';

export interface Offer {
  id: string;
  jobId: string;
  workerId: string;
  salary: number;
  status: OfferStatus;
  createdAt: string;
}

export interface Employment {
  id: string;
  jobId: string;
  workerId: string;
  employerId: string;
  startDate: string;
  salary: number;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  /** Conversation/assignment this message belongs to. */
  assignmentId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
