import "dotenv/config";
import { defineConfig } from "prisma/config";

// 의도: workspace 전체 `pnpm install`에서 본 패키지의 postinstall(`prisma generate`)이 돌 때
// DATABASE_URL이 없는 환경(예: 같은 monorepo의 web 빌드)에서 throw하지 않는다.
// generate는 code generation이라 url 없이도 동작 가능. migrate/db pull 등 url이 필요한
// 명령은 prisma가 자체 검사로 빠짐없이 실패시킨다.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(url ? { datasource: { url } } : {}),
});
