# npm 배포 가이드

## 사전 준비

npm 로그인 (SSH 환경에서는 토큰 사용):
```bash
# 브라우저 있는 환경
npm adduser

# SSH 환경 (토큰)
# 1. https://www.npmjs.com → 프로필 → Access Tokens → Generate New Token
# 2. Granular Token → Read and write + "Bypass two-factor authentication" 체크
npm config set //registry.npmjs.org/:_authToken=npm_TOKEN_HERE
npm whoami  # 확인
```

## 배포 절차

### 1. MCP 서버 빌드

```bash
npm run build:mcp
```

출력: `dist/server.js` (단일 파일, 모든 의존성 번들)

### 2. dist/package.json 버전 업데이트

```bash
# dist/package.json의 version 필드를 수정
# 예: "0.1.1" → "0.1.2"
```

루트 `package.json`이 아니라 **`dist/package.json`**을 수정.

### 3. README 복사

```bash
cp README.md dist/README.md
```

### 4. 배포

```bash
cd dist && npm publish --access public && cd ..
```

### 5. 확인

```bash
npm info gitmolt version
# 또는
npx -y gitmolt@latest --help
```

## 파일 구조

```
dist/
├── package.json   ← npm 배포용 (의존성 제로)
├── README.md      ← npm 페이지에 표시
└── server.js      ← 단일 번들 (tsup, ~700KB)
```

**주의:** 루트 `package.json`은 Next.js 웹앱 + MCP 서버를 모두 포함. npm에는 `dist/package.json`만 배포.

## 빌드 설정

`tsup.config.ts`:
- `noExternal: [/.*/]` — MCP SDK 포함 모든 의존성 번들
- `banner: { js: "#!/usr/bin/env node" }` — npx 실행 가능
- `format: ["esm"]`, `target: "node18"`

## 체크리스트

- [ ] `npm run build:mcp` 성공
- [ ] `dist/package.json` 버전 올림
- [ ] `cp README.md dist/README.md`
- [ ] `node dist/server.js < /dev/null` — 에러 없이 시작
- [ ] `cd dist && npm publish --access public`
- [ ] https://www.npmjs.com/package/gitmolt 확인
