import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CreateFeedbackBody, ListFeedbackQuery } from './feedback.schema.js';

type Db = Prisma.TransactionClient;

// ip_hash는 관리자에게도 내보내지 않는다
const publicFields = {
  id: true, lang: true, formKey: true, formNo: true, fieldId: true,
  type: true, message: true, status: true, createdAt: true, updatedAt: true,
} as const;

export const feedbackRepository = {
  /** 같은 ip_hash 요청끼리 트랜잭션 안에서 줄을 세운다 (끝나면 자동 해제) */
  lockIpHash: (tx: Db, ipHash: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ipHash}))`,

  countSince: (tx: Db, ipHash: string, since: Date) =>
    tx.feedback.count({ where: { ipHash, createdAt: { gte: since } } }),

  create: (tx: Db, data: Omit<CreateFeedbackBody, 'website'> & { ipHash: string | null }) =>
    tx.feedback.create({
      data: {
        lang: data.lang,
        formKey: data.formKey ?? null,
        formNo: data.formNo ?? null,
        fieldId: data.fieldId ?? null,
        type: data.type,
        message: data.message,
        ipHash: data.ipHash,
      },
      select: { id: true },
    }),

  transaction: <T>(fn: (tx: Db) => Promise<T>) => prisma().$transaction(fn),

  findPage: async (q: ListFeedbackQuery) => {
    const where = { status: q.status, lang: q.lang, formKey: q.formKey };
    const [total, items] = await Promise.all([
      prisma().feedback.count({ where }),
      prisma().feedback.findMany({ where, select: publicFields, orderBy: { createdAt: 'desc' }, skip: q.offset, take: q.limit }),
    ]);
    return { total, items };
  },

  updateStatus: (id: string, status: 'new' | 'read' | 'resolved') =>
    prisma().feedback.update({ where: { id }, data: { status }, select: publicFields }),

  delete: (id: string) => prisma().feedback.delete({ where: { id } }),
};

export const isRecordNotFound = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
