const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
};

const PRIZE_URL =
  'https://meister.hrdkorea.or.kr/common/prizeWinnerList_popup.do';

const JOB_TASK_URL =
  'https://meister.hrdkorea.or.kr/common/jobTaskList_popup.do';

const REGIONS = {
  '서울특별시': 'J01',
  '부산광역시': 'J04',
  '울산광역시': 'J05',
  '대구광역시': 'J07',
  '인천광역시': 'J10',
  '광주광역시': 'J13',
  '대전광역시': 'J16',
  '경기도': 'J19',
  '강원특별자치도': 'J22',
  '충청북도': 'J25',
  '충청남도': 'J26',
  '전북특별자치도': 'J28',
  '전라남도': 'J31',
  '경상북도': 'J34',
  '경상남도': 'J37',
  '제주특별자치도': 'J40',
  '세종특별자치시': 'J41',
};

const JOBS = {
  '클라우드컴퓨팅': '331',
  'IT네트워크시스템': '337',
  '사이버보안': '339',
};

const ALLOWED_AWARDS = {
  '금[1등]': 1,
  '은[2등]': 2,
  '동[3등]': 3,
  '우수상[4등]': 4,
  '장려상[5등]': 5,
};

function cleanText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTableRows(html) {
  const $ = cheerio.load(html);

  const rows = [];

  $('tbody tr').each((_, tr) => {
    const cols = [];

    $(tr)
      .find('td')
      .each((_, td) => {
        cols.push(cleanText($(td).text()));
      });

    rows.push(cols);
  });

  return rows;
}

async function get(url, params) {
  const res = await axios.get(url, {
    params,
    headers: HEADERS,
    timeout: 20000,
  });

  return res.data;
}

async function post(url, data) {
  const body = new URLSearchParams(data);

  const res = await axios.post(url, body.toString(), {
    headers: {
      ...HEADERS,
      'Content-Type':
        'application/x-www-form-urlencoded',
    },
    timeout: 20000,
  });

  return res.data;
}

function parseScores(text) {
  const rows = getTableRows(text);

  const parsed = [];

  for (const cols of rows) {
    if (cols.length < 4) continue;

    const rank = cols[cols.length - 1];

    if (!/^\d+$/.test(rank)) continue;

    if (Number(rank) > 5) continue;

    parsed.push({
      player_no: String(cols[0]).padStart(2, '0'),
      score: Number(cols[cols.length - 2]),
      rank_in_region: Number(rank),
    });
  }

  parsed.sort(
    (a, b) =>
      a.rank_in_region - b.rank_in_region
  );

  return parsed;
}

function parsePrizeWinners(text, targetJob) {
  const rows = getTableRows(text);

  const parsed = [];

  for (const cols of rows) {
    if (cols.length < 6) continue;

    const jobName = cols[1];
    const award = cols[2];

    if (
      jobName === targetJob &&
      ALLOWED_AWARDS[award]
    ) {
      parsed.push({
        award,
        rank_in_region:
          ALLOWED_AWARDS[award],
        name: cols[3],
        affiliation: cols[4],
        region_short: cols[5],
      });
    }
  }

  parsed.sort(
    (a, b) =>
      a.rank_in_region - b.rank_in_region
  );

  return parsed;
}

const CONCURRENCY = 5;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);

  let cursor = 0;

  const workers = Array.from(
    {
      length: Math.min(
        limit,
        items.length
      ),
    },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;

        results[i] = await fn(items[i]);
      }
    }
  );

  await Promise.all(workers);

  return results;
}

async function collectRegion(
  regionName,
  code,
  jobName,
  jobCd,
  year
) {
  const [scoreText, prizeText] =
    await Promise.all([
      post(JOB_TASK_URL, {
        compet_cd: `${year}${code}`,
        compet_nm: `${year}년도 ${regionName} 기능경기대회`,
        job_cd: jobCd,
      }),
      get(PRIZE_URL, {
        compet_cd: `${year}${code}`,
      }),
    ]);

  const scoreRows = parseScores(scoreText);

  const prizeRows = parsePrizeWinners(
    prizeText,
    jobName
  );

  const prizeMap = new Map(
    prizeRows.map((r) => [
      r.rank_in_region,
      r,
    ])
  );

  const merged = [];

  for (const s of scoreRows) {
    const p = prizeMap.get(
      s.rank_in_region
    );

    if (!p) continue;

    merged.push({
      region: regionName,
      rank_in_region: s.rank_in_region,
      score: s.score,
      player_no: s.player_no,
      award: p.award,
      name: p.name,
      affiliation: p.affiliation,
    });
  }

  return merged;
}

async function collectJob(
  jobName,
  jobCd,
  year
) {
  const regions = Object.entries(REGIONS);

  const perRegion = await mapLimit(
    regions,
    CONCURRENCY,
    async ([regionName, code]) => {
      try {
        const merged =
          await collectRegion(
            regionName,
            code,
            jobName,
            jobCd,
            year
          );

        return { regionName, merged };
      } catch (err) {
        console.log(
          `${regionName} 실패`,
          err.message
        );

        return {
          regionName,
          merged: [],
        };
      }
    }
  );

  const byRegion = {};
  const national = [];

  for (const {
    regionName,
    merged,
  } of perRegion) {
    byRegion[regionName] = merged;

    national.push(...merged);
  }

  national.sort((a, b) => {
    if (b.score !== a.score)
      return b.score - a.score;

    return (
      a.rank_in_region -
      b.rank_in_region
    );
  });

  national.forEach((r, i) => {
    r.rank_national = i + 1;
  });

  return {
    byRegion,
    national,
  };
}

app.get('/api/results', async (req, res) => {
  try {
    const year = String(
      req.query.year || '2026'
    );

    const job = String(
      req.query.job ||
        Object.keys(JOBS)[0]
    );

    if (!JOBS[job]) {
      return res
        .status(400)
        .json({
          error: 'Unknown job',
        });
    }

    const {
      byRegion,
      national,
    } = await collectJob(
      job,
      JOBS[job],
      year
    );

    res.json({
      year,
      job,
      byRegion,
      national,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>

<meta charset="UTF-8" />

<title>
기능경기대회 결과 조회
</title>

<style>

body{
  font-family:sans-serif;
  background:#111827;
  color:white;
  padding:30px;
}

h1{
  margin-bottom:20px;
}

.controls{
  display:flex;
  gap:10px;
  margin-bottom:20px;
}

select,button{
  padding:10px;
  border:none;
  border-radius:10px;
}

button{
  background:#2563eb;
  color:white;
  cursor:pointer;
}

button:hover{
  opacity:0.9;
}

table{
  width:100%;
  border-collapse:collapse;
  background:#1f2937;
  margin-top:20px;
}

th,td{
  border:1px solid #374151;
  padding:10px;
  text-align:center;
}

th{
  background:#374151;
}

tr:hover{
  background:#2b3547;
}

.loading{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:15px;

  padding:50px;
  margin-top:20px;

  background:#1f2937;
  border-radius:20px;
}

.spinner{
  width:50px;
  height:50px;

  border:5px solid #374151;
  border-top:5px solid #3b82f6;

  border-radius:50%;

  animation:spin 1s linear infinite;
}

@keyframes spin{
  0%{
    transform:rotate(0deg);
  }

  100%{
    transform:rotate(360deg);
  }
}

.error{
  background:#7f1d1d;
  padding:30px;
  border-radius:20px;
  margin-top:20px;
}

</style>

</head>

<body>

<h1>
기능경기대회 결과 조회
</h1>

<div class="controls">

<select id="year">
  <option>2030</option>
  <option>2029</option>
  <option>2028</option>
  <option>2027</option>
  <option selected>2026</option>
  <option>2025</option>
  <option>2024</option>
  <option>2023</option>
  <option>2022</option>
  <option>2021</option>
  <option>2020</option>
</select>

<select id="job">
  <option>클라우드컴퓨팅</option>
  <option>IT네트워크시스템</option>
  <option>사이버보안</option>
</select>

<button onclick="loadData()">
조회
</button>

</div>

<div id="result"></div>

<script>

async function loadData(){

  const result =
    document.getElementById('result');

  result.innerHTML = \`
    <div class="loading">
      <div class="spinner"></div>
      <p>데이터 불러오는 중...</p>
    </div>
  \`;

  const year =
    document.getElementById('year').value;

  const job =
    document.getElementById('job').value;

  try{

    const res = await fetch(
      '/api/results?year='
      + encodeURIComponent(year)
      + '&job='
      + encodeURIComponent(job)
    );

    if(!res.ok){
      throw new Error('서버 오류');
    }

    const data = await res.json();

    let html = '';

    html += '<h2>전국 순위</h2>';

    if(data.national.length === 0){

      html += \`
        <div class="error">
          데이터가 없습니다.
        </div>
      \`;

      result.innerHTML = html;
      return;
    }

    html += \`
      <table>
        <tr>
          <th>전국등수</th>
          <th>지역</th>
          <th>시도등수</th>
          <th>수상</th>
          <th>점수</th>
          <th>선수번호</th>
          <th>이름</th>
          <th>소속</th>
        </tr>
    \`;

    for(const r of data.national){

      html += \`
        <tr>
          <td>\${r.rank_national}</td>
          <td>\${r.region}</td>
          <td>\${r.rank_in_region}</td>
          <td>\${r.award}</td>
          <td>\${r.score}</td>
          <td>\${r.player_no}</td>
          <td>\${r.name}</td>
          <td>\${r.affiliation}</td>
        </tr>
      \`;
    }

    html += '</table>';

    result.innerHTML = html;

  }catch(err){

    console.error(err);

    result.innerHTML = \`
      <div class="error">
        <h3>데이터 불러오기 실패</h3>
        <p>\${err.message}</p>
      </div>
    \`;
  }
}

loadData();

</script>

</body>
</html>
  `);
});

module.exports = app;
