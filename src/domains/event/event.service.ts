import { eventRepository } from './event.repository.js';
import type { CreateEventsBody } from './event.schema.js';

export const eventService = {
  async record(body: CreateEventsBody): Promise<number> {
    const { count } = await eventRepository.createMany(body.visitorId, body.events);
    return count;
  },
};
