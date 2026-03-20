const { testConnection } = require('../src/config/db');
const { AqiAPI } = require('../src/services/trigger-engine/apis');
const TriggerEngine = require('../src/services/trigger-engine/index');

async function main() {
  await testConnection();
  console.log('Testing WAQI API directly...');
  const aqiData = await AqiAPI.getCurrentAQI(28.6315, 77.2167);
  console.log('WAQI DATA:', JSON.stringify(aqiData, null, 2));

  const engine = new TriggerEngine();
  console.log('Running trigger cycle...');
  await engine.runEnvironmentalScan();
  console.log('Complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
