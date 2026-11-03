import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// 스키마에 .openapi({ example }) 를 쓸 수 있게 한다. 스키마 파일은 zod를 여기서 가져온다.
extendZodWithOpenApi(z);

export { z };
