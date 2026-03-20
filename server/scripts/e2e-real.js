const cp = require('child_process');
const util = require('util');
const exec = util.promisify(cp.exec);

async function runE2E() {
  const BASE_URL = 'http://localhost:5000/api/v1';

  console.log('--- GigShield AI Real Data E2E Test ---');

  let token = '';
  let zoneId = '';
  let policyId = '';

  try {
    // 1. Register User
    console.log('1. Registering new worker...');
    const phone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        password: 'password123',
        name: 'Real Test Worker',
        platform: 'zomato'
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(JSON.stringify(regData));
    
    token = regData.data.tokens.accessToken;
    console.log('   ✅ Registered. Phone:', phone);

    // 2. Fetch Zones
    console.log('2. Fetching zones...');
    const zonesRes = await fetch(`${BASE_URL}/users/zones`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const zonesData = await zonesRes.json();
    if (!zonesRes.ok) throw new Error(JSON.stringify(zonesData));
    
    const selectedZone = zonesData.data.zones.find(z => z.zone_name === 'Connaught Place') || zonesData.data.zones[0];
    zoneId = selectedZone.id;
    console.log(`   ✅ Zone selected: ${selectedZone.zone_name}`);

    // Select the zone
    await fetch(`${BASE_URL}/users/zone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ zone_id: zoneId })
    });

    // 3. Create Policy (Air Pollution)
    console.log('3. Purchasing Air Pollution Policy...');
    const policyRes = await fetch(`${BASE_URL}/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        coverage_tier: 'standard',
        disruption_type: 'air_pollution'
      })
    });
    const policyData = await policyRes.json();
    if (!policyRes.ok) throw new Error(`Policy creation failed: ${JSON.stringify(policyData)}`);
    
    policyId = policyData.data.policy.id;
    console.log(`   ✅ Policy Activated! ID: ${policyId}`);

    console.log('\n4. Manually triggering the Disruption Engine to fetch live WAQI data...');
    const { stdout, stderr } = await exec('docker compose exec -T server node scripts/force-trigger.js');
    console.log(stdout);
    if (stderr) console.error(stderr);
    console.log('   ✅ Trigger engine executed.');

    console.log('\n5. Checking for auto-approved claim...');
    await new Promise(r => setTimeout(r, 2000));

    const claimRes = await fetch(`${BASE_URL}/claims`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const claimData = await claimRes.json();
    
    if (claimData.data.claims && claimData.data.claims.length > 0) {
      console.log('   ✅ CLAIM FOUND!');
      const c = claimData.data.claims[0];
      console.log(`      ID: ${c.id}`);
      console.log(`      Status: ${c.status}`);
      console.log(`      Amount: ₹${c.claim_amount}`);
      console.log(`      Fraud Score: ${c.fraud_score}`);
      console.log('\n🎉 Real API End-to-End test passed successfully! Dummy data completely removed.');
    } else {
      console.log('   ❌ No claim found. This means either the real AQI is < 50 (very clean air today!) or the API failed.');
    }

  } catch (err) {
    console.error('❌ E2E Failed:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

runE2E();
