const http = require('http');

const API_KEY = 'sk-int-testbench999900001111222233334444';
const PORT = 3000;

const COMBOS = [
  'deepseek-v4-pro',
  'gpt-5.5',
  'gemini-3.8-flash-high',
  'claude-opus-4.6',
  'claude-sonnet-4.6',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-6-astra',
  'aidev-lite:free'
];

function testModel(modelName) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: modelName,
      messages: [
        { role: 'user', content: 'Say "OK" in 1 word only.' }
      ],
      max_tokens: 10,
      stream: false
    });

    const startTime = Date.now();
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 60000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const duration = Date.now() - startTime;
          try {
            const parsed = JSON.parse(data);
            resolve({
              model: modelName,
              statusCode: res.statusCode,
              durationMs: duration,
              success: res.statusCode >= 200 && res.statusCode < 300,
              data: parsed
            });
          } catch (e) {
            resolve({
              model: modelName,
              statusCode: res.statusCode,
              durationMs: duration,
              success: false,
              raw: data.slice(0, 300)
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        model: modelName,
        statusCode: null,
        durationMs: Date.now() - startTime,
        success: false,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        model: modelName,
        statusCode: 408,
        durationMs: Date.now() - startTime,
        success: false,
        error: 'Timeout after 25s'
      });
    });

    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Testing all 9 public combo models...\n');
  const results = [];
  for (const model of COMBOS) {
    process.stdout.write(`Testing: ${model.padEnd(25)} ... `);
    const res = await testModel(model);
    if (res.success) {
      const content = res.data?.choices?.[0]?.message?.content?.trim() || '(empty response)';
      console.log(`[PASS] (${res.statusCode}) in ${res.durationMs}ms - Reply: "${content.slice(0, 60)}"`);
    } else {
      const errMsg = res.data?.error?.message || res.data?.error || res.error || res.raw || 'Unknown error';
      console.log(`[FAIL] (${res.statusCode}) in ${res.durationMs}ms - Error: ${JSON.stringify(errMsg)}`);
    }
    results.push(res);
  }

  console.log('\n========================================');
  console.log('SUMMARY:');
  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  console.log(`Passed: ${passed.length}/${results.length}`);
  console.log(`Failed: ${failed.length}/${results.length}`);
}

run();
