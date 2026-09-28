// Synthetic differential report only; never calls market APIs or trade runners.
import {falconDifferential} from '../lib/falcon-shadow.ts';
import {bar} from '../lib/falcon-spec-fixtures.mjs';
const rows=[bar(0,102,98,100),bar(1,101,95,98),bar(2,100,96,98),bar(3,99,94,95),bar(4,101,96,99),bar(5,102,97,101),bar(6,101,98,100),bar(7,103,99,102)];
const records=falconDifferential(rows);
console.log(JSON.stringify({dataset:'synthetic-spec-v1',bars:rows.length,differentBars:records.filter(r=>r.difference).length,records},null,2));
