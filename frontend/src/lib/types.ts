// ชนิดข้อมูลที่ backend ส่งกลับมา — ให้ตรงกับ backend/prisma/schema.prisma (JSON เป็น camelCase · id เป็น UUID)

export type { Paged } from './api';

export type CoreRole = 'student' | 'alumni' | 'staff' | 'lecturer' | 'guest' | 'admin';
export type SubsystemRole = 'STUDENT' | 'TEACHER' | 'STAFF' | 'ADMIN';
export type ResourceStatus = 'AVAILABLE' | 'FULL' | 'MAINTENANCE' | 'OFFLINE';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALLOCATED' | 'CANCELLED' | 'EXPIRED';

/** GET /api/v1/me — ตัวตนจาก Core Hub token (ไม่มีชื่อ: Core Hub ไม่ใส่ชื่อใน token) */
export interface Me {
  id: string;
  email: string | null;
  coreRole: CoreRole;
  subsystemRole: SubsystemRole;
  permissions: string[];
  session: { expiresAt: string };
}

export interface Advisor {
  personCode: string;
  fullNameTh: string;
}

export interface Course {
  code: string;
  nameTh: string;
  nameEn: string | null;
  credits: number;
}

export interface Resource {
  id: string;
  serverName: string;
  totalCpu: number;
  totalRamGb: number;
  totalStorageGb: number;
  hasGpu: boolean;
  status: ResourceStatus;
}

/** GET /api/v1/resource-usages — คำนวณสดจาก view resource_usage */
export interface ResourceUsage {
  resourceId: string;
  serverName: string;
  status: ResourceStatus;
  hasGpu: boolean;
  totalCpu: number;
  totalRamGb: number;
  totalStorageGb: number;
  usedCpu: number;
  usedRamGb: number;
  usedStorageGb: number;
  freeCpu: number;
  freeRamGb: number;
  freeStorageGb: number;
  activeAllocations: number;
}

export interface Allocation {
  id: string;
  requestId: string;
  resourceId: string;
  ipAddress: string;
  port: number;
  accessNote: string | null;
  assignedAt: string;
  releasedAt: string | null;
  resource?: Pick<Resource, 'id' | 'serverName' | 'hasGpu' | 'status'>;
  request?: {
    id: string;
    status: RequestStatus;
    courseCode: string;
    reqCpu: number;
    reqRamGb: number;
    reqStorageGb: number;
    coreUserId: string;
    personCode: string | null;
  };
}

export interface ResourceRequest {
  id: string;
  coreUserId: string;
  personCode: string | null;
  teacherPersonCode: string | null;
  courseCode: string;
  reqCpu: number;
  reqRamGb: number;
  reqStorageGb: number;
  isGpuRequired: boolean;
  reason: string;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  rejectReason: string | null;
  reviewerCoreUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  allocations?: (Allocation & { resource?: { serverName: string; hasGpu: boolean } })[];
}

export interface AuditLog {
  id: string;
  coreUserId: string | null;
  action: string;
  details: string | null;
  createdAt: string;
}
