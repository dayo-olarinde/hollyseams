
export interface Subject {
  id: string;
  customerId: string;
  name: string;
  relationship: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectInput {
  name: string;
  relationship?: string;
}
