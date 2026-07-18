import type { Timestamp } from "firebase/firestore";

export type ProjectStatus = "open" | "closed";

export type Project = {
  id: string;
  customerName: string;
  customerEmail?: string;
  address: string;
  contractorName: string;
  contractorUid: string;
  contractorNotifyEmail?: string;
  groupId?: string;
  locationId?: string;
  roundLabel?: string;
  notes?: string;
  status?: ProjectStatus;
  createdAt?: Timestamp;
  closedAt?: Timestamp;
  customerSignature?: string;
  customerSignedName?: string;
  customerSignedAt?: Timestamp;
  contractorSignature?: string;
  contractorSignedName?: string;
  contractorSignedAt?: Timestamp;
};

export type Location = {
  id: string;
  name: string;
  address?: string;
  groupId?: string;
  contractorUid: string;
  contractorNotifyEmail?: string;
  roundIds: string[];
  createdAt?: Timestamp;
};

export type Group = {
  id: string;
  name: string;
  ownerName?: string;
  ownerEmail?: string;
  contractorUid: string;
  projectIds: string[];
  locationIds?: string[];
  createdAt?: Timestamp;
};

export type PunchStatus = "open" | "in_progress" | "completed";

export type PunchPriority = "low" | "medium" | "high";

export type PunchCategory =
  | "painting"
  | "electrical"
  | "plumbing"
  | "carpentry"
  | "drywall"
  | "flooring"
  | "hvac"
  | "landscaping"
  | "other";

export const PUNCH_CATEGORIES: { value: PunchCategory; label: string }[] = [
  { value: "painting", label: "Painting" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "carpentry", label: "Carpentry" },
  { value: "drywall", label: "Drywall" },
  { value: "flooring", label: "Flooring" },
  { value: "hvac", label: "HVAC" },
  { value: "landscaping", label: "Landscaping" },
  { value: "other", label: "Other" }
];

export const PUNCH_PRIORITIES: { value: PunchPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

export type HistoryEntry = {
  action: string;
  by: "customer" | "contractor";
  at: Timestamp;
};

export type PunchItem = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  room: string;
  category: PunchCategory;
  priority: PunchPriority;
  customerPhotos: string[];
  contractorAssessment: string;
  contractorPhotos: string[];
  status: PunchStatus;
  createdBy?: "customer" | "contractor";
  history?: HistoryEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
