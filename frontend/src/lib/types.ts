// ชนิดข้อมูลที่ backend ส่งกลับมา — ให้ตรงกับ prisma/schema.prisma

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type ResourceStatus = 'AVAILABLE' | 'FULL' | 'MAINTENANCE' | 'OFFLINE';
export type RequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ALLOCATED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface User {
  id: number;
  studentCode: string | null;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface Teacher {
  id: number;
  fullName: string;
  email: string;
}

export interface Resource {
  id: number;
  serverName: string;
  totalCpu: number;
  totalRamGb: number;
  totalStorageGb: number;
  hasGpu: boolean;
  status: ResourceStatus;
}

/** อ่านจาก view resource_usage — คำนวณสดทุกครั้ง ไม่ได้เก็บไว้ในตาราง */
export interface ResourceUsage {
  resource_id: number;
  server_name: string;
  status: ResourceStatus;
  has_gpu: boolean;
  total_cpu: number;
  total_ram_gb: number;
  total_storage_gb: number;
  used_cpu: number;
  used_ram_gb: number;
  used_storage_gb: number;
  free_cpu: number;
  free_ram_gb: number;
  free_storage_gb: number;
  active_allocations: number;
}

export interface Allocation {
  id: number;
  requestId: number;
  resourceId: number;
  ipAddress: string;
  port: number;
  accessNote: string | null;
  assignedAt: string;
  releasedAt: string | null;
  resource?: Pick<Resource, 'id' | 'serverName' | 'hasGpu' | 'status'>;
  request?: {
    id: number;
    status: RequestStatus;
    subjectCode: string;
    reqCpu: number;
    reqRamGb: number;
    reqStorageGb: number;
    studentId: number;
    student?: { id: number; fullName: string; studentCode: string | null };
  };
}

export interface ResourceRequest {
  id: number;
  studentId: number;
  teacherId: number;
  subjectCode: string;
  reqCpu: number;
  reqRamGb: number;
  reqStorageGb: number;
  reqGpu: boolean;
  reason: string;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  student?: { id: number; studentCode: string | null; fullName: string; email: string };
  teacher?: { id: number; fullName: string; email: string };
  allocations?: Allocation[];
}

export interface AuditLog {
  id: number;
  userId: number | null;
  action: string;
  details: string | null;
  createdAt: string;
  user?: { id: number; fullName: string; email: string; role: UserRole } | null;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pageCount: number };
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: User;
}
