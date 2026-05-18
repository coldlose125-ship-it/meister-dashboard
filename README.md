# 기능경기대회 결과 대시보드

Node.js 기반 기능경기대회 순위 조회 대시보드입니다.

HRDKorea 기능경기대회 데이터를 크롤링하여
전국 순위와 시도별 결과를 웹 UI로 조회할 수 있습니다.

---

## 기능

- 연도 선택
- 직종 선택
- 전국 순위 조회
- 실시간 데이터 크롤링
- 로딩 스피너 UI
- 에러 처리
- 반응형 테이블 UI

---

## 지원 직종

- 클라우드컴퓨팅
- IT네트워크시스템
- 사이버보안

---

## 사용 기술

- Node.js
- Express
- Axios
- Cheerio

---

## 설치 방법

```bash
git clone https://github.com/아이디/meister-dashboard.git
```

```bash
cd meister-dashboard
```

```bash
npm install
```

---

## 실행 방법

```bash
node server.js
```

브라우저 접속:

```text
http://localhost:3000
```

---

## 프로젝트 구조

```text
meister-dashboard/
│
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
│
└── node_modules/
```

---

## API

### 결과 조회

```http
GET /api/results
```

### Query Parameters

| 이름 | 설명 |
|---|---|
| year | 연도 |
| job | 직종명 |

예시:

```text
/api/results?year=2026&job=사이버보안
```

---

## 스크린샷

추후 추가 예정

---

## 라이선스

MIT License