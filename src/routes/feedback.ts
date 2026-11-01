import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { hashIp } from '../lib/ip-hash.js';
import { parse } from '../lib/validate.js';
import { fieldIdSchema, formKeySchema, formNoSchema, langSchema } from '../lib/common-schema.js';
import { HttpError } from '../middlewares/error-handler.js';

// 같은 사람(ip_hash)이 이 시간 안에 이만큼 넘게 보내면 429
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const RATE_MAX = 5;

const bodySchema = z.object({
  lang: langSchema,
  formKey: formKeySchema.optional(),
  formNo: formNoSchema.optional(),
  fieldId: fieldIdSchema.optional(),
  type: z.enum(['general', 'translation', 'guide', 'bug']).default('general'),
  message: z.string().trim().min(1, '내용을 입력해 주세요').max(2000, '2000자 이하'),
  /** 사람 눈에 안 보이는 칸. 봇이 채우면 저장하지 않는다 */
  website: z.string().optional(),
});

export const feedbackRouter = Router();

feedbackRouter.post('/', async (req, res) => {
  const body = parse(bodySchema, req.body);

  if (body.website) {
    // 봇에게는 성공처럼 보이게 하고 저장하지 않는다
    res.status(201).json({ id: null });
    return;
  }

  const ipHash = hashIp(req.ip);
  if (ipHash) {
    const recent = await db().feedback.count({
      where: { ipHash, createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) } },
    });
    if (recent >= RATE_MAX) {
      throw new HttpError(429, 'TOO_MANY_REQUESTS', '잠시 후 다시 보내 주세요.');
    }
  }

  const created = await db().feedback.create({
    data: {
      lang: body.lang,
      formKey: body.formKey ?? null,
      formNo: body.formNo ?? null,
      fieldId: body.fieldId ?? null,
      type: body.type,
      message: body.message,
      ipHash,
    },
    select: { id: true },
  });
  res.status(201).json({ id: created.id });
});
