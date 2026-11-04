import { hashIp } from '../../utils/ip-hash.js';
import { AppError } from '../../utils/response.js';
import { auditRepository } from '../audit/audit.repository.js';
import { feedbackRepository as repo, isRecordNotFound } from './feedback.repository.js';
import type { CreateFeedbackBody, ListFeedbackQuery } from './feedback.schema.js';

// 같은 사람(ip_hash)이 이 시간 안에 이만큼 넘게 보내면 429
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const RATE_MAX = 5;

export const feedbackService = {
  /** 저장한 id. 봇(숨은 칸이 채워짐)이면 저장하지 않고 null */
  async create(body: CreateFeedbackBody, ip: string | undefined): Promise<string | null> {
    if (body.website) return null;
    const { website: _ignored, ...data } = body;
    const ipHash = hashIp(ip);

    // 세기와 저장을 한 트랜잭션에서, 같은 ip_hash끼리는 잠금으로 줄 세움.
    // 잠금이 없으면 동시에 온 요청들이 모두 0건으로 보고 제한을 넘는다 (10건 중 8건 저장되던 것 확인).
    const created = await repo.transaction(async (tx) => {
      if (ipHash) {
        await repo.lockIpHash(tx, ipHash);
        const recent = await repo.countSince(tx, ipHash, new Date(Date.now() - RATE_WINDOW_MS));
        if (recent >= RATE_MAX) throw new AppError('FEEDBACK_RATE_LIMITED');
      }
      return repo.create(tx, { ...data, ipHash });
    });
    return created.id;
  },

  list: (q: ListFeedbackQuery) => repo.findPage(q),

  /** actor: 바꾼 관리자 (관리 기록에 남긴다) */
  async updateStatus(id: string, status: 'new' | 'read' | 'resolved', actor: string) {
    try {
      const item = await repo.updateStatus(id, status);
      await auditRepository.log(actor, 'feedback.status', id, { status });
      return item;
    } catch (e) {
      if (isRecordNotFound(e)) throw new AppError('FEEDBACK_NOT_FOUND');
      throw e;
    }
  },

  /** 본문은 기록에 남기지 않는다 (개인정보가 있어서 지우는 경우가 많다) */
  async remove(id: string, actor: string) {
    try {
      const removed = await repo.delete(id);
      await auditRepository.log(actor, 'feedback.delete', id, { lang: removed.lang, type: removed.type });
    } catch (e) {
      if (isRecordNotFound(e)) throw new AppError('FEEDBACK_NOT_FOUND');
      throw e;
    }
  },
};
