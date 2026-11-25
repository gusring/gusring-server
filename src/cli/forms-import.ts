// 서식 정의 한꺼번에 넣기 (처음 옮길 때: gusring-web-v2의 TS 서식 29개 → DB).
//   로컬:  npm run forms:import <폴더>
//   NAS:   docker compose cp <폴더> app:/tmp/forms
//          docker compose exec app node dist/cli/forms-import.js /tmp/forms
// 폴더에는 forms.json([{ key, formNo, definition }])과 PNG들. definition.pages[].image는 같은 폴더의 PNG 파일 이름.
// 이미지를 넣고, 서식을 만들고, 검사를 통과하면 1판으로 공개한다 (기록의 actor는 'import').
// 같은 key가 이미 있으면(지운 서식 포함) 건너뛴다 → 여러 번 돌려도 된다.
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { z } from '../config/zod.js';
import { disconnectPrisma } from '../config/prisma.js';
import { formRepository } from '../domains/form/form.repository.js';
import { formDefinition, formPage } from '../domains/form/form.schema.js';
import { formService } from '../domains/form/form.service.js';
import { formKeySchema, formNoSchema } from '../utils/common-schema.js';
import { AppError } from '../utils/response.js';

const ACTOR = 'import';

const importPage = formPage.omit({ imageId: true }).extend({ image: z.string().min(1) }).strict();
const importItem = z
  .object({
    key: formKeySchema,
    formNo: formNoSchema,
    definition: formDefinition.omit({ pages: true }).extend({ pages: z.array(importPage) }).strict(),
  })
  .strict();
const importFile = z.array(importItem);

const issues = (e: z.ZodError) => e.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');

export type ImportResult = { created: string[]; skipped: string[]; failed: string[] };

/** 테스트에서도 부른다. 출력은 log로 */
export async function importForms(dir: string, log: (line: string) => void = console.info): Promise<ImportResult> {
  const root = resolve(dir);
  const parsed = importFile.safeParse(JSON.parse(await readFile(join(root, 'forms.json'), 'utf8')));
  if (!parsed.success) throw new Error(`forms.json 모양이 맞지 않습니다\n${issues(parsed.error)}`);

  const result: ImportResult = { created: [], skipped: [], failed: [] };
  const imageIds = new Map<string, string>();

  for (const item of parsed.data) {
    const where = `${item.formNo} ${item.key}`;
    if (await formRepository.findByKeyAnyState(item.key)) {
      log(`- ${where}: 이미 있음, 건너뜀`);
      result.skipped.push(item.key);
      continue;
    }
    try {
      const pages = [];
      for (const { image, ...page } of item.definition.pages) {
        // 폴더 밖 파일은 읽지 않는다
        if (basename(image) !== image) throw new Error(`이미지 이름에 경로가 있음 (${image})`);
        let id = imageIds.get(image);
        if (!id) {
          id = (await formService.uploadImage(await readFile(join(root, image)), ACTOR)).id;
          imageIds.set(image, id);
        }
        pages.push({ ...page, imageId: id });
      }
      const form = await formService.create({ key: item.key, formNo: item.formNo, definition: { ...item.definition, pages } }, ACTOR);
      try {
        await formService.publish(form.id, {}, ACTOR);
        log(`✓ ${where}: 1판 공개`);
        result.created.push(item.key);
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'FORM_INVALID')) throw e;
        const details = (e.details as { path: string; message: string }[]).map((p) => `    ${p.path}: ${p.message}`).join('\n');
        log(`✗ ${where}: 초안만 만들고 공개하지 못함\n${details}`);
        result.failed.push(item.key);
      }
    } catch (e) {
      log(`✗ ${where}: ${e instanceof Error ? e.message : String(e)}`);
      result.failed.push(item.key);
    }
  }
  log(`\n공개 ${result.created.length} · 건너뜀 ${result.skipped.length} · 실패 ${result.failed.length}`);
  return result;
}

const isMain = process.argv[1] && /forms-import\.[jt]s$/.test(process.argv[1]);
if (isMain) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('사용: forms-import <폴더>  (폴더에 forms.json과 PNG)');
    process.exit(2);
  }
  importForms(dir)
    .then((r) => {
      process.exitCode = r.failed.length ? 1 : 0;
    })
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => disconnectPrisma());
}
