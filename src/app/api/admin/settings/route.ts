import { z } from 'zod';
import { db } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

const schema = z.object({
  key: z.string().min(1).max(80),
  value: z.unknown(),
});

export const PUT = route(async (request: Request) => {
  await requireUser(['ADMIN']);
  const body = schema.parse(await request.json());

  const setting = await db.platformSetting.upsert({
    where: { key: body.key },
    update: { value: body.value as never },
    create: { key: body.key, value: body.value as never },
  });

  return ok({ key: setting.key, value: setting.value });
});
