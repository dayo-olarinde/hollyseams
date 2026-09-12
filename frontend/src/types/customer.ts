
export interface Customer {
  id: string;
  name: string;
  phoneNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  name: string;
  phoneNumber?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  phoneNumber?: string;
}
