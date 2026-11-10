import { prisma } from '../../config/prisma.js';
import type { EventInput } from './event.schema.js';

export const eventRepository = {
  createMany: (visitorId: string, events: EventInput[]) =>
    prisma().usageEvent.createMany({
      data: events.map((e) => ({
        type: e.type,
        lang: e.lang ?? null,
        formKey: e.formKey ?? null,
        formNo: e.formNo ?? null,
        fieldId: e.fieldId ?? null,
        category: e.category ?? null,
        searchTerm: e.searchTerm ?? null,
        resultCount: e.resultCount ?? null,
        durationSec: e.durationSec ?? null,
        visitorId,
      })),
    }),
};
