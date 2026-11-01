import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { parse } from '../lib/validate.js';
import { formKeySchema, langSchema } from '../lib/common-schema.js';
import { HttpError } from '../middlewares/error-handler.js';

export const PAGE_SIZE = 20;

const statusSchema = z.enum(['new', 'read', 'resolved']);

const listQuery = z.object({
  status: statusSchema.optional(),
  lang: langSchema.optional(),
  formKey: formKeySchema.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

// ip_hash는 관리자에게도 보여주지 않는다
const publicFields = {
  id: true, lang: true, formKey: true, formNo: true, fieldId: true,
  type: true, message: true, status: true, createdAt: true, updatedAt: true,
} as const;

const idSchema = z.uuid();

function parseId(raw: unknown): string {
  const r = idSchema.safeParse(raw);
  if (!r.success) throw new HttpError(404, 'NOT_FOUND', '피드백이 없습니다.');
  return r.data;
}

function isNotFound(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025';
}

export const adminFeedbackRouter = Router();

adminFeedbackRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const where = { status: q.status, lang: q.lang, formKey: q.formKey };
  const [total, items] = await Promise.all([
    db().feedback.count({ where }),
    db().feedback.findMany({
      where,
      select: publicFields,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  res.json({ items, page: q.page, pageSize: PAGE_SIZE, total });
});

adminFeedbackRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = parse(z.object({ status: statusSchema }).strict(), req.body);
  try {
    const item = await db().feedback.update({ where: { id }, data: { status }, select: publicFields });
    res.json(item);
  } catch (e) {
    if (isNotFound(e)) throw new HttpError(404, 'NOT_FOUND', '피드백이 없습니다.');
    throw e;
  }
});

// 본문에 이용자가 개인정보를 적었을 때 지우는 용도
adminFeedbackRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    await db().feedback.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (isNotFound(e)) throw new HttpError(404, 'NOT_FOUND', '피드백이 없습니다.');
    throw e;
  }
});
